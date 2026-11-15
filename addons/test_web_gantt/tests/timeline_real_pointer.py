# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Real pointer events for tours.

A tour that needs real mouse events (so the browser's own text selection and text drag take part)
publishes ``window.__tl_mouse = {id, events}`` and waits for ``window.__tl_mouse_done === id``.
``RealPointerMixin.start_tour_with_pointer`` runs the tour with a helper thread that sends the
events with the Chrome DevTools protocol (``Input.dispatchMouseEvent``) and marks the request as
done. Any error of the thread fails the test; a request is sent once, never again after a failure.
``now`` (a UTC ``datetime``) moves the browser's clock there, for a tour that needs a fixed date.
"""
import json
import threading
import time
from datetime import UTC
from unittest.mock import patch

from odoo.tests.common import ChromeBrowser

PENDING_MOUSE = """(() => {
    const request = window.__tl_mouse;
    return request && window.__tl_mouse_done !== request.id ? JSON.stringify(request) : null;
})()"""


class MouseBridge(threading.Thread):
    """Sends the mouse events a tour publishes on ``window.__tl_mouse`` as real ones."""

    def __init__(self, browser):
        super().__init__(daemon=True)
        self.browser = browser
        self.stopped = threading.Event()
        self.error = None
        self.sent = set()

    def evaluate(self, expression):
        res = self.browser._websocket_request('Runtime.evaluate', params={
            'expression': expression, 'returnByValue': True,
        })
        return ((res or {}).get('result') or {}).get('value')

    def run(self):
        try:
            while not self.stopped.wait(.05):
                pending = self.evaluate(PENDING_MOUSE)
                if not pending:
                    continue
                request = json.loads(pending)
                if request['id'] in self.sent:
                    continue  # never send a request twice, even after a failure
                self.sent.add(request['id'])
                for event in request['events']:
                    self.browser._websocket_request('Input.dispatchMouseEvent', params=event)
                    time.sleep(.03)
                self.evaluate(f"window.__tl_mouse_done = {int(request['id'])}")
        except Exception as error:  # noqa: BLE001 - recorded, and re-raised by the test
            self.error = error


def clock_script(now):
    """Moves ``new Date()`` and ``Date.now()`` to ``now`` (UTC); the clock then runs on."""
    millis = int(now.replace(tzinfo=UTC).timestamp() * 1000)
    return f"""(() => {{
    const RealDate = Date;
    const offset = {millis} - RealDate.now();
    class ShiftedDate extends RealDate {{
        constructor(...args) {{
            if (args.length === 0) {{
                super(RealDate.now() + offset);
            }} else {{
                super(...args);
            }}
        }}
        static now() {{
            return RealDate.now() + offset;
        }}
    }}
    window.Date = ShiftedDate;
}})();"""


class RealPointerMixin:
    """For an ``HttpCase``: tours that ask for real mouse events."""

    def start_tour_with_pointer(self, path, name, now=None, **kwargs):
        original = ChromeBrowser._wait_code_ok
        navigate = ChromeBrowser.navigate_to

        def wait_code_ok(browser, *args, **kw):
            bridge = MouseBridge(browser)
            bridge.start()
            try:
                return original(browser, *args, **kw)
            finally:
                bridge.stopped.set()
                bridge.join(5)
                if bridge.error is not None:
                    raise AssertionError(
                        f'the real pointer bridge failed: {bridge.error!r}') from bridge.error

        def navigate_to(browser, *args, **kw):
            if now is not None:
                browser._websocket_request('Page.addScriptToEvaluateOnNewDocument', params={
                    'source': clock_script(now),
                })
            return navigate(browser, *args, **kw)

        with patch.object(ChromeBrowser, '_wait_code_ok', wait_code_ok), \
                patch.object(ChromeBrowser, 'navigate_to', navigate_to):
            self.start_tour(path, name, **kwargs)
