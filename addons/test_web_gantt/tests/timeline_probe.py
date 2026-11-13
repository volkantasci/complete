# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probe harness of the timeline view: open a host action in a real headless Chrome and read
computed styles and rectangles.

The browser runs in the zone ``Etc/GMT-3`` (three hours ahead of UTC) in US English, and its
clock is moved to Thursday 12 November 2026 at 00:30 local time, the "D0" of the host records,
so the same week is on screen on every day the suite runs.
"""
import contextlib
import json
import logging
import os
import re
import time

from odoo.http.session import session_store
from odoo.tests import HttpCase
from odoo.tests.common import ChromeBrowser, flushing_cursor

_logger = logging.getLogger(__name__)

VIEWPORTS = {
    'desktop': {'size': (1600, 900), 'touch': False},
    'phone': {'size': (390, 844), 'touch': True},
}

HOST_TODAY = '2026-11-12'
GEOMETRY_TOLERANCE = 0.5
STYLE_TOLERANCE = 0.01

# Moves `new Date()` and `Date.now()` to the host day; the clock then runs on from there.
CLOCK_SCRIPT = """
(() => {
    const RealDate = Date;
    const offset = Date.UTC(2026, 10, 11, 21, 30, 0) - RealDate.now();
    class ShiftedDate extends RealDate {
        constructor(...args) {
            if (args.length === 0) {
                super(RealDate.now() + offset);
            } else {
                super(...args);
            }
        }
        static now() {
            return RealDate.now() + offset;
        }
    }
    window.Date = ShiftedDate;
})();
"""

_NUMBER = r'[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?'


def parse_colour(value):
    """Return ``(r, g, b, a)`` (channels 0-255, alpha 0-1) of an ``rgb()``/``rgba()`` text."""
    match = re.fullmatch(r'rgba?\((.*)\)', value.strip().lower())
    if not match:
        raise ValueError(f'not a colour: {value!r}')
    numbers = [float(n) for n in re.findall(_NUMBER, match.group(1))]
    if len(numbers) not in (3, 4):
        raise ValueError(f'not a colour: {value!r}')
    return (*numbers[:3], numbers[3] if len(numbers) == 4 else 1.0)


def _numbers(text):
    return [float(n) for n in re.findall(_NUMBER, text)]


def compare_value(prop, expected, measured):
    """Return ``None`` when ``measured`` (computed text or number) matches ``expected``, else why.

    ``expected`` is the text of the measured-values table. Geometry compares within half a
    pixel, other lengths within a hundredth, colours channel by channel.
    """
    if measured is None:
        return 'no value'
    if prop.startswith('geometry.'):
        if abs(float(measured) - float(expected)) > GEOMETRY_TOLERANCE:
            return f'{measured} instead of {expected}'
        return None
    measured = str(measured).strip()
    if prop == 'font-family':
        # Chrome quotes the names that need it; the table lists them bare
        if expected != measured.replace('"', ''):
            return f'{measured} instead of {expected}'
        return None
    if prop == 'transform':
        want, got = _numbers(expected), _numbers(measured)
        ok = len(want) == len(got) and all(
            abs(a - b) < 1e-3 for a, b in zip(want, got, strict=True))
        return None if ok else f'{measured} instead of {expected}'
    if prop == 'box-shadow':
        if expected == 'none' or measured == 'none':
            return None if expected == measured else f'{measured} instead of {expected}'
        want_colour = re.search(r'rgba?\([^)]*\)', expected)
        got_colour = re.search(r'rgba?\([^)]*\)', measured)
        if not (want_colour and got_colour):
            return f'{measured} instead of {expected}'
        want = _numbers(expected.replace(want_colour.group(0), ''))
        got = _numbers(measured.replace(got_colour.group(0), ''))
        if want != got or not _same_colour(want_colour.group(0), got_colour.group(0)):
            return f'{measured} instead of {expected}'
        return None
    if prop in ('background-image', 'border-image'):
        norm = re.compile(r'\s+')
        if norm.sub(' ', expected) != norm.sub(' ', measured):
            return f'{measured} instead of {expected}'
        return None
    if expected.startswith('rgb'):
        try:
            same = _same_colour(expected, measured)
        except ValueError:
            return f'{measured} instead of {expected}'
        return None if same else f'{measured} instead of {expected}'
    try:
        want, got = float(expected), float(measured.removesuffix('px'))
    except ValueError:
        return None if expected == measured else f'{measured} instead of {expected}'
    if abs(want - got) > STYLE_TOLERANCE:
        return f'{measured} instead of {expected}'
    return None


def _same_colour(a, b):
    want, got = parse_colour(a), parse_colour(b)
    return (
        all(abs(x - y) < 0.5 for x, y in zip(want[:3], got[:3], strict=True))
        and abs(want[3] - got[3]) < 0.01
    )


class TimelineProbeCase(HttpCase):
    """Base class: ``with self.page(action, scheme, viewport) as browser`` opens one session."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        Pill = cls.env['test.web.gantt.pill']
        # the demo data (when loaded) holds the same records relative to the real today
        Pill.with_context(active_test=False).search([]).unlink()
        cls.env['test.web.gantt.pill2'].with_context(active_test=False).search([]).unlink()
        cls.records = Pill._tl_build_host_records(today=HOST_TODAY, tz_offset_hours=3)
        cls.has_theme = bool(cls.env['ir.module.module'].search_count(
            [('name', '=', 'web_enterprise'), ('state', '=', 'installed')]))

    def setUp(self):
        super().setUp()
        admin = self.env.ref('base.user_admin')
        admin.tour_enabled = False
        admin.lang = 'en_US'

    def skip_unless_theme(self, scheme):
        if scheme == 'dark' and not self.has_theme:
            self.skipTest('the dark scheme needs web_enterprise, which is not installed')

    # -- session --------------------------------------------------------------------

    @contextlib.contextmanager
    def page(self, action, scheme='light', viewport='desktop', query='', login='admin',
             touch=None):
        """Open ``/odoo/action-<xmlid>`` and wait for the timeline grid (or the list)."""
        if scheme == 'dark':
            user = self.env['res.users'].search([('login', '=', login)], limit=1)
            self.env['res.users.settings']._find_or_create_for_user(user).color_scheme = 'dark'
        width, height = VIEWPORTS[viewport]['size']
        if touch is None:
            touch = VIEWPORTS[viewport]['touch']
        self.browser_size = f'{width}x{height}'
        self.touch_enabled = touch
        browser = ChromeBrowser(self, headless=True)
        with self.allow_requests(browser=browser), contextlib.ExitStack() as atexit:
            atexit.enter_context(flushing_cursor(self.cr))
            atexit.callback(self._wait_remaining_requests)
            atexit.enter_context(browser.cleanup)
            self.authenticate(login, login, browser=browser)
            self._ensure_session_file()
            self.browser = browser
            request = browser._websocket_request
            request('Emulation.setDeviceMetricsOverride', params={
                'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': touch,
            })
            request('Emulation.setTouchEmulationEnabled', params={'enabled': touch})
            request('Emulation.setTimezoneOverride', params={'timezoneId': 'Etc/GMT-3'})
            request('Emulation.setEmulatedMedia', params={'features': [
                {'name': 'prefers-reduced-motion', 'value': 'reduce'},
            ]})
            request('Page.addScriptToEvaluateOnNewDocument', params={'source': CLOCK_SCRIPT})
            url = f'/odoo/action-{action}{query}'
            browser.navigate_to(self.base_url() + url, wait_stop=False)
            self.wait("!!document.querySelector('.o_web_client') || "
                      "location.pathname.startsWith('/web/login')", timeout=120)
            self.assertFalse(self.js("location.pathname.startsWith('/web/login')"),
                             f'{url} redirected to the login page')
            ready = '.o_list_view' if 'view_type=list' in query else '.o_tl_renderer .o_tl_row'
            self.wait(f"!!document.querySelector({json.dumps(ready)})", timeout=60)
            self.wait("document.readyState === 'complete'")
            if scheme == 'dark':
                loaded = self.js("getComputedStyle(document.documentElement)"
                                 ".getPropertyValue('--o-cws-scheme').trim()")
                self.assertEqual(loaded, 'dark', 'the dark bundle did not load')
            self.settle()
            yield browser

    def _ensure_session_file(self):
        """Write the session file again when ``authenticate`` could not (it swallows errors)."""
        store = session_store()
        path = store.get_session_path(self.session.sid)
        for attempt in range(5):
            if os.path.exists(path):
                return
            if attempt < 2:
                store.save(self.session)
            else:
                os.makedirs(os.path.dirname(path), mode=0o755, exist_ok=True)
                with open(path, 'w', encoding='utf-8') as handle:
                    json.dump(dict(self.session), handle)
                os.chmod(path, 0o644)
            time.sleep(.2)
        self.assertTrue(os.path.exists(path), 'the session file cannot be written')

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
        self.assertTrue(self.browser._wait_ready(condition_js, timeout=timeout),
                        f'never true: {condition_js}')

    def settle(self, milliseconds=350):
        """Wait for two animation frames and ``milliseconds`` (transitions, layout, images)."""
        self.js(f"""(async () => {{
            const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
            await frame();
            await new Promise((r) => setTimeout(r, {int(milliseconds)}));
            await frame();
        }})()""")

    # -- element finders (JS expressions) -------------------------------------------

    @staticmethod
    def pill(name):
        return (
            "[...document.querySelectorAll('.o_tl_pill')].find((p) => "
            f"p.querySelector('.o_tl_pill_title')?.textContent.trim() === {json.dumps(name)})")

    @staticmethod
    def row(name):
        return (
            "[...document.querySelectorAll('.o_tl_row')].find((r) => "
            "r.querySelector('.o_tl_row_header')?.getAttribute('title') === "
            f"{json.dumps(name)})")

    # -- reads ----------------------------------------------------------------------

    def read(self, element_js, props):
        """Computed values (and ``geometry.*`` rectangle parts) of the element ``element_js``."""
        return self.js(f"""(() => {{
            let el = null;
            try {{ el = {element_js}; }} catch (e) {{ el = null; }}
            if (!el) {{ return null; }}
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const out = {{}};
            for (const p of {json.dumps(list(props))}) {{
                out[p] = p.startsWith('geometry.')
                    ? r[p.slice(9)] : cs.getPropertyValue(p).trim();
            }}
            return out;
        }})()""")

    def geometry(self, element_js):
        return self.read(element_js, ['geometry.x', 'geometry.y', 'geometry.width',
                                      'geometry.height'])

    # -- scrolling and pointer ------------------------------------------------------

    def scroll_grid(self, delta=300):
        """Scroll the grid (and the page on the phone) by ``delta`` pixels both ways."""
        self.js(f"""(() => {{
            const grid = document.querySelector('.o_tl_renderer');
            grid.scrollLeft += {int(delta)};
            grid.scrollTop += {int(delta)};
            window.scrollBy(0, {int(delta)});
            document.querySelectorAll('.o_content, .o_action').forEach((e) => {{
                e.scrollTop += {int(delta)};
            }});
        }})()""")
        self.settle()

    def pointer_to(self, element_js):
        """Move the real pointer to the centre of the element (scrolled into view first)."""
        self.js(f"{element_js}.scrollIntoView({{block: 'nearest', inline: 'nearest'}})")
        box = self.geometry(element_js)
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': 'mouseMoved',
            'x': box['geometry.x'] + box['geometry.width'] / 2,
            'y': box['geometry.y'] + box['geometry.height'] / 2,
        })
        self.settle()

    def pointer_away(self):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': 'mouseMoved', 'x': 2, 'y': 2,
        })
        self.settle()

    def click_js(self, element_js):
        self.js(f"{element_js}.click()")
        self.settle()

    # -- checking -------------------------------------------------------------------

    def probe(self, probe_id, element_js, scheme, viewport, expected, label=''):
        """Compare the element with the expected values; one ``subTest`` per property.

        ``expected`` maps property to the table text. A mismatch is logged on one line
        ``PROBE-MISMATCH|probe|scheme|viewport|property|expected|measured|element``.
        """
        measured = self.read(element_js, list(expected))
        for prop, want in expected.items():
            with self.subTest(probe=probe_id, scheme=scheme, viewport=viewport, prop=prop,
                              element=label):
                if measured is None:
                    why = 'no such element'
                    got = None
                else:
                    got = measured[prop]
                    why = compare_value(prop, want, got)
                if why:
                    _logger.warning('PROBE-MISMATCH|%s|%s|%s|%s|%s|%s|%s', probe_id, scheme,
                                    viewport, prop, want, got, label or element_js[:80])
                self.assertIsNone(why, f'{probe_id} {scheme}/{viewport} {prop}: {why}')
