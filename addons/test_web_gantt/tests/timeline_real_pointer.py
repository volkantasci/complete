# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Real pointer events for tours.

A tour that needs real mouse events (so the browser's own text selection and text drag take part)
publishes ``window.__tl_mouse = {id, events}`` and waits for ``window.__tl_mouse_done === id``.
``RealPointerMixin.start_tour_with_pointer`` runs the tour with a helper thread that sends the
events with the Chrome DevTools protocol (``Input.dispatchMouseEvent``) and marks the request as
done. Any error of the thread fails the test; a request is sent once, never again after a failure.
"""
import json
import threading
import time
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


class RealPointerMixin:
    """For an ``HttpCase``: tours that ask for real mouse events."""

    def start_tour_with_pointer(self, path, name, **kwargs):
        original = ChromeBrowser._wait_code_ok

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

        with patch.object(ChromeBrowser, '_wait_code_ok', wait_code_ok):
            self.start_tour(path, name, **kwargs)
