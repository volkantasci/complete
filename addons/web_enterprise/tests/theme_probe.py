# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probe harness: load a real back-end page in Chrome and read computed styles.

Every theme test that asserts what the user sees (colours, sizes, states) builds on
``ThemeProbeCase``. A test method opens one browser session with ``page()`` and reuses
it for all its reads.
"""
import contextlib
import json
import re

from odoo.tests import HttpCase
from odoo.tests.common import ChromeBrowser, flushing_cursor

from .theme_fixtures import build_theme_fixtures

KEYS = {
    'Tab': ('Tab', 'Tab', 9),
    'Enter': ('Enter', 'Enter', 13),
    'Escape': ('Escape', 'Escape', 27),
    'Space': (' ', 'Space', 32),
    'ArrowLeft': ('ArrowLeft', 'ArrowLeft', 37),
    'ArrowUp': ('ArrowUp', 'ArrowUp', 38),
    'ArrowRight': ('ArrowRight', 'ArrowRight', 39),
    'ArrowDown': ('ArrowDown', 'ArrowDown', 40),
}

STATES = ('hover', 'active', 'focus', 'focus-visible')

_NUMBER = r'[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?'


def parse_colour(value):
    """Return ``(r, g, b, a)`` with channels 0-255 and alpha 0-1 for a CSS colour string.

    Understands what ``getComputedStyle`` returns (``rgb()``, ``rgba()``,
    ``color(srgb ...)``) and hex notation (3, 4, 6 or 8 digits).
    """
    text = value.strip().lower()
    if text.startswith('#'):
        digits = text[1:]
        if len(digits) in (3, 4):
            digits = ''.join(c * 2 for c in digits)
        if len(digits) not in (6, 8) or not re.fullmatch(r'[0-9a-f]+', digits):
            raise ValueError(f'not a colour: {value!r}')
        channels = [int(digits[i:i + 2], 16) for i in range(0, 6, 2)]
        alpha = int(digits[6:8], 16) / 255 if len(digits) == 8 else 1.0
        return (*channels, alpha)
    match = re.fullmatch(r'rgba?\((.*)\)', text)
    scale = 1.0
    if not match:
        match = re.fullmatch(r'color\(\s*srgb\s+(.*)\)', text)
        scale = 255.0
    if not match:
        raise ValueError(f'not a colour: {value!r}')
    parts = re.split(r'\s*[,/]\s*|\s+', match.group(1).strip())
    numbers = []
    for part in parts:
        if part.endswith('%'):
            numbers.append(float(part[:-1]) / 100 * (255 if scale == 1.0 else 1))
        else:
            if not re.fullmatch(_NUMBER, part):
                raise ValueError(f'not a colour: {value!r}')
            numbers.append(float(part))
    if len(numbers) not in (3, 4):
        raise ValueError(f'not a colour: {value!r}')
    channels = [n * scale for n in numbers[:3]]
    alpha = numbers[3] if len(numbers) == 4 else 1.0
    return (*channels, alpha)


class ThemeProbeCase(HttpCase):
    """Base class of the probe tests (add the tags on the concrete classes)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.fixtures = build_theme_fixtures(cls.env)

    # -- browser session ------------------------------------------------------------

    @contextlib.contextmanager
    def page(self, url, scheme='light', size=(1600, 900), touch=False,
             reduced_motion=False, login='admin', lang=None):
        """Open ``url`` in a fresh Chrome as ``login`` with the colour scheme stored.

        The user's ``color_scheme`` setting is written before the page loads, and the
        page is checked to carry the matching role values.
        """
        user = self.env['res.users'].search([('login', '=', login)], limit=1)
        self.assertTrue(user, f'no user {login}')
        self.env['res.users.settings']._find_or_create_for_user(user).color_scheme = scheme
        if lang:
            user.lang = lang
        width, height = size
        self.browser_size = f'{width}x{height}'
        self.touch_enabled = touch
        browser = ChromeBrowser(self, headless=True)
        with self.allow_requests(browser=browser), contextlib.ExitStack() as atexit:
            atexit.enter_context(flushing_cursor(self.cr))
            atexit.callback(self._wait_remaining_requests)
            atexit.enter_context(browser.cleanup)
            self.authenticate(login, login, browser=browser)
            self.browser = browser
            request = browser._websocket_request
            request('Emulation.setDeviceMetricsOverride', params={
                'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': touch,
            })
            request('Emulation.setTouchEmulationEnabled', params={'enabled': touch})
            request('Emulation.setEmulatedMedia', params={'features': [
                {'name': 'prefers-reduced-motion',
                 'value': 'reduce' if reduced_motion else 'no-preference'},
            ]})
            browser.navigate_to(self.base_url() + url, wait_stop=False)
            self.wait("!!document.querySelector('.o_web_client')", timeout=120)
            self.wait("document.readyState === 'complete'")
            loaded = self.js(
                "getComputedStyle(document.documentElement)"
                ".getPropertyValue('--o-cws-scheme').trim()"
            )
            self.assertEqual(loaded, scheme, f'the {scheme} bundle did not load')
            yield browser

    # -- evaluation -----------------------------------------------------------------

    def js(self, expression):
        """Evaluate in the page (promises awaited) and return the value."""
        res = self.browser._websocket_request('Runtime.evaluate', params={
            'expression': expression, 'awaitPromise': True, 'returnByValue': True,
        })
        if res.get('exceptionDetails'):
            raise AssertionError(json.dumps(res['exceptionDetails'])[:600])
        return res['result'].get('value')

    def wait(self, condition_js, timeout=30):
        self.assertTrue(
            self.browser._wait_ready(condition_js, timeout=timeout),
            f'never true: {condition_js}',
        )

    # -- reads ----------------------------------------------------------------------

    def style(self, selector, *props, pseudo=None, index=0):
        """Computed values of ``props`` (CSS names) for the ``index``-th match."""
        return self.js(f"""(() => {{
            const el = document.querySelectorAll({json.dumps(selector)})[{int(index)}];
            if (!el) {{ throw new Error("no element for " + {json.dumps(selector)}); }}
            const cs = getComputedStyle(el, {json.dumps(pseudo)});
            return Object.fromEntries(
                {json.dumps(list(props))}.map((p) => [p, cs.getPropertyValue(p).trim()])
            );
        }})()""")

    def rect(self, selector, index=0):
        return self.js(f"""(() => {{
            const el = document.querySelectorAll({json.dumps(selector)})[{int(index)}];
            if (!el) {{ throw new Error("no element for " + {json.dumps(selector)}); }}
            const r = el.getBoundingClientRect();
            return {{x: r.x, y: r.y, width: r.width, height: r.height}};
        }})()""")

    # -- states and input -----------------------------------------------------------

    def _node_id(self, selector, index):
        request = self.browser._websocket_request
        request('DOM.enable')
        request('CSS.enable')
        root = request('DOM.getDocument', params={'depth': 0})['root']['nodeId']
        ids = request('DOM.querySelectorAll', params={
            'nodeId': root, 'selector': selector,
        })['nodeIds']
        self.assertGreater(len(ids), index, f'no element for {selector}')
        return ids[index]

    @contextlib.contextmanager
    def forced(self, selector, *states, index=0):
        """Force pseudo-classes ('hover', 'active', 'focus', 'focus-visible') while open.

        On entry, waits until the computed styles settle (two animation frames plus the
        element's longest transition duration and delay) so the probe never reads a
        mid-transition value.
        """
        for state in states:
            self.assertIn(state, STATES)
        node = self._node_id(selector, index)
        request = self.browser._websocket_request
        request('CSS.forcePseudoState', params={
            'nodeId': node, 'forcedPseudoClasses': list(states),
        })
        try:
            self._settle(selector, index)
            yield
        finally:
            request('CSS.forcePseudoState', params={
                'nodeId': node, 'forcedPseudoClasses': [],
            })

    def _settle(self, selector, index):
        self.js(f"""(async () => {{
            const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
            const el = document.querySelectorAll({json.dumps(selector)})[{int(index)}];
            await frame();
            await frame();
            const cs = getComputedStyle(el);
            const seconds = (text) => text.split(',').map((t) => parseFloat(t) || 0);
            const durations = seconds(cs.transitionDuration);
            const delays = seconds(cs.transitionDelay);
            const total = Math.max(...durations.map((d, i) => d + delays[i % delays.length]));
            await new Promise((r) => setTimeout(r, total * 1000 + 50));
            await frame();
        }})()""")

    def pointer_to(self, selector, index=0):
        """Move the real pointer to the centre of the element."""
        self.js(
            f"document.querySelectorAll({json.dumps(selector)})[{int(index)}]"
            ".scrollIntoView({block: 'nearest', inline: 'nearest'})"
        )
        box = self.rect(selector, index)
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': 'mouseMoved',
            'x': box['x'] + box['width'] / 2,
            'y': box['y'] + box['height'] / 2,
        })

    def key(self, name):
        key, code, keycode = KEYS[name]
        for kind in ('keyDown', 'keyUp'):
            params = {
                'type': kind, 'key': key, 'code': code, 'windowsVirtualKeyCode': keycode,
            }
            if kind == 'keyDown' and name == 'Space':
                params['text'] = ' '
            self.browser._websocket_request('Input.dispatchKeyEvent', params=params)

    # -- assertions -----------------------------------------------------------------

    def assertColour(self, css_value, hex_value, alpha=1.0, tol=2):
        """Check a computed colour against a hex colour (and alpha) within ``tol`` per channel."""
        got = parse_colour(css_value)
        want = parse_colour(hex_value)
        want_alpha = alpha if len(hex_value.strip()) not in (5, 9) else want[3] * alpha
        for name, g, w in zip('rgb', got[:3], want[:3], strict=True):
            self.assertLessEqual(
                abs(g - w), tol, f'{name} of {css_value} differs from {hex_value}',
            )
        self.assertLessEqual(
            abs(got[3] - want_alpha), 0.02, f'alpha of {css_value} differs from {want_alpha}',
        )
