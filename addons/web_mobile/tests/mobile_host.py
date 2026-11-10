# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Browser test host for the mobile bridge.

``CwmHostCase`` opens a real Chrome over DevTools, makes it look like the native app
(browser identification, viewport, touch) and installs ``host_stub.js`` before the page's
own scripts, so the page sees a host object like the one the app provides.

Handle on the bridge from the page: the root component's environment,
``odoo.__WOWL_DEBUG__.root.env.services.mobile`` (set by ``mountComponent`` of the
Community web client once the web client is mounted; ``.o_web_client`` is then present).
"""
import contextlib
import json
import os
import pathlib
import time

from odoo.http.session import session_store
from odoo.tests import HttpCase
from odoo.tests.common import ChromeBrowser, flushing_cursor

STUB_PATH = pathlib.Path(__file__).with_name('host_stub.js')
SERVICE = 'odoo.__WOWL_DEBUG__.root.env.services.mobile'


class CwmHostCase(HttpCase):
    """Base class: ``with self.host_session(host={}) as browser:`` then ``js``/``wait``."""

    UA_ANDROID = (
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/126.0.0.0 Mobile Safari/537.36 OdooMobile Android'
    )
    UA_IOS = (
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
        '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 OdooMobile (iOS)'
    )
    UA_DESKTOP = (
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/126.0.0.0 Safari/537.36'
    )

    def setUp(self):
        super().setUp()
        # no onboarding tour over the pages
        self.env.ref('base.user_admin').tour_enabled = False
        self._cwm_console = []

    # -- session ---------------------------------------------------------------------

    @contextlib.contextmanager
    def host_session(
        self, url='/odoo', *, host=None, ua=UA_ANDROID, mobile=False, dark=False,
        fail_picture=False,
    ):
        """Open a signed-in (admin) browser on ``url`` and yield it.

        :param host: ``None`` for no test host (a normal browser). A dict installs the stub,
            the dict being its setup (``{}`` is App-A with all capabilities): keys
            ``plugins``, ``answers``, ``files``, ``fileStatus``, ``delayMs`` (see
            ``host_stub.js``).
        :param ua: browser identification; use ``UA_DESKTOP`` for a normal browser.
        :param mobile: ``True`` for 390x844 with touch, else 1600x900 without.
        :param dark: emulate the dark colour scheme.
        :param fail_picture: answer the requests for the user's medium-sized picture with a
            server error (the interception is on from the first request of the page).
            ``self.fail_picture`` can be changed during the session.
        """
        browser = ChromeBrowser(self, headless=True)
        self._cwm_console = []
        self._record_console(browser)
        self.fail_picture = fail_picture
        self._intercept_picture(browser)
        with self.allow_requests(browser=browser), contextlib.ExitStack() as atexit:
            atexit.enter_context(flushing_cursor(self.cr))
            atexit.callback(self._wait_remaining_requests)
            atexit.enter_context(browser.cleanup)
            self.authenticate('admin', 'admin', browser=browser)
            self._ensure_session_file()
            self.browser = browser
            request = browser._websocket_request
            width, height = (390, 844) if mobile else (1600, 900)
            request('Emulation.setUserAgentOverride', params={'userAgent': ua})
            request('Emulation.setDeviceMetricsOverride', params={
                'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': mobile,
            })
            request('Emulation.setTouchEmulationEnabled', params={'enabled': mobile})
            request('Emulation.setEmulatedMedia', params={'features': [
                {'name': 'prefers-color-scheme', 'value': 'dark' if dark else 'light'},
            ]})
            if host is not None:
                source = f'window.__cwmHostSetup = {json.dumps(host)};\n' + STUB_PATH.read_text()
                request('Page.addScriptToEvaluateOnNewDocument', params={'source': source})
            browser.navigate_to(self.base_url() + url, wait_stop=False)
            self.wait("!!document.querySelector('.o_web_client')", timeout=120)
            # the handle on the services is set once the web client is fully mounted
            self.wait("!!odoo.__WOWL_DEBUG__?.root?.env?.services?.mobile", timeout=120)
            yield browser

    def _record_console(self, browser):
        """Keep every console entry of the page as ``{'type', 'text'}`` in ``_cwm_console``."""
        entries = self._cwm_console
        original = browser._handlers['Runtime.consoleAPICalled']

        def record(type=None, args=None, **kw):  # pylint: disable=redefined-builtin
            text = ' '.join(str(browser._from_remoteobject(arg)) for arg in args or [])
            entries.append({'type': type, 'text': text})
            return original(type=type, args=args, **kw)

        browser._handlers['Runtime.consoleAPICalled'] = record

    def _intercept_picture(self, browser):
        """Answer the picture requests with a 500 while ``self.fail_picture`` is true.

        The Community browser wrapper already intercepts every request (``Fetch.enable``);
        this wraps its handler.
        """
        original = browser._handlers['Fetch.requestPaused']

        def paused(**params):
            if self.fail_picture and '/image_medium' in params['request']['url']:
                browser._websocket_send('Fetch.fulfillRequest', params={
                    'requestId': params['requestId'], 'responseCode': 500,
                    'responseHeaders': [{'name': 'Content-Type', 'value': 'text/plain'}],
                })
                return None
            return original(**params)

        browser._handlers['Fetch.requestPaused'] = paused

    def arm_unload_snapshot(self):
        """Keep the test host's log when the page goes away (a reload loses the page's own).

        Read it with ``unload_snapshot`` once the page came back.
        """
        self.js("""(() => {
            sessionStorage.removeItem('cwmSnapshot');
            window.addEventListener('pagehide', () => sessionStorage.setItem(
                'cwmSnapshot', JSON.stringify(window.__cwmHostLog || [])));
            return true;
        })()""")

    def unload_snapshot(self, timeout=30):
        """The host log of the page that went away, once it did; ``[]`` entries kept as seen."""
        self.wait("!!sessionStorage.getItem('cwmSnapshot')", timeout=timeout)
        return json.loads(self.js("sessionStorage.getItem('cwmSnapshot')"))

    def _ensure_session_file(self):
        """Write the session file again when ``authenticate`` could not (rare)."""
        store = session_store()
        path = store.get_session_path(self.session.sid)
        for _attempt in range(5):
            if os.path.exists(path):
                return
            store.save(self.session)
            time.sleep(.2)
        self.assertTrue(os.path.exists(path), 'the session file cannot be written')

    # -- page access -----------------------------------------------------------------

    def js(self, code):
        """Evaluate ``code`` in the page (promises awaited) and return its value."""
        res = self.browser._websocket_request('Runtime.evaluate', params={
            'expression': code, 'awaitPromise': True, 'returnByValue': True,
        })
        if res.get('exceptionDetails'):
            raise AssertionError(json.dumps(res['exceptionDetails'])[:600])
        return res['result'].get('value')

    def wait(self, condition, timeout=30):
        self.assertTrue(
            self.browser._wait_ready(condition, timeout=timeout), f'never true: {condition}',
        )

    def host_log(self):
        """The requests received by the stub: ``[{action, args, id, at}]``."""
        return self.js('window.__cwmHostLog') or []

    def host_requests(self, action):
        return [entry for entry in self.host_log() if entry['action'] == action]

    def console_entries(self, prefix='[cwm]'):
        """Console entries (``{'type', 'text'}``) whose text starts with ``prefix``."""
        return [entry for entry in self._cwm_console if entry['text'].startswith(prefix)]

    # -- calling the bridge from the page --------------------------------------------

    def call_capability(self, name, args=None, key=None):
        """Call ``mobile.<name>(args)`` in the page without waiting for the answer.

        The outcome is stored in ``window.__cwmCalls[key]`` as ``{state, value}`` where state
        is ``pending``, ``resolved`` or ``rejected``. Returns ``key`` (generated when not
        given); read it with ``call_outcome``.
        """
        key = key or f'call{len(self.js("Object.keys(window.__cwmCalls || {})") or [])}'
        self.js(f"""(() => {{
            const calls = (window.__cwmCalls ||= {{}});
            const key = {json.dumps(key)};
            calls[key] = {{state: 'pending'}};
            {SERVICE}[{json.dumps(name)}]({json.dumps(args)}).then(
                (value) => (calls[key] = {{state: 'resolved', value}}),
                (value) => (calls[key] = {{state: 'rejected', value}}),
            );
        }})()""")
        return key

    def call_outcome(self, key):
        return self.js(f'window.__cwmCalls[{json.dumps(key)}]')

    def answer_request(self, request_id, result):
        """Answer a request by hand, as the app would, through ``odoo.native_notify``."""
        self.js(f'odoo.native_notify({json.dumps(request_id)}, {json.dumps(result)})')

    # -- tours -----------------------------------------------------------------------

    def run_tour(self, name, timeout=120):
        """Run the registered tour ``name`` in the current page and wait for its end."""
        self.wait(f'odoo.isTourReady({json.dumps(name)})', timeout=timeout)
        done = len(self._cwm_console)
        self.js(f"odoo.startTour({json.dumps(name)}, {{mode: 'auto'}}); true")
        deadline = time.time() + timeout
        while time.time() < deadline:
            if any(e['text'] == 'tour succeeded' for e in self._cwm_console[done:]):
                return
            result = self.browser._result
            if result.done() and result.exception():
                raise result.exception()
            time.sleep(.2)
        self.fail(f'tour {name} did not finish in {timeout}s')
