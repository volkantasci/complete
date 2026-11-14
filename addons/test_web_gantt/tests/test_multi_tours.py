# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of slice 002b3 (multi-selection, multi-creation and the side panel).

The browser inherits the time zone of the test process, pinned to UTC here, and the records are
built around the date of that zone with a zero offset, so the browser and the records agree on
what today is. A scenario that changes the database runs inside the test's own savepoint, which
is rolled back after it: every test starts from the records of `setUpClass`.

A tour that needs real pointer events asks for them through ``window.__tl_mouse``: a helper
thread of the test sends the events with the Chrome DevTools protocol while the tour waits.
"""
import json
import logging
import os
import threading
import time
from unittest.mock import patch

from odoo import Command, fields
from odoo.tests import HttpCase, tagged
from odoo.tests.common import ChromeBrowser

_logger = logging.getLogger(__name__)

HOST_ACTION = '/odoo/action-test_web_gantt.host_action_{}'
PILL = 'test.web.gantt.pill'
DESKTOP = '1600x900'
PHONE = '390x844'
RESTRICTED = 'restricted_editor'

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

    def evaluate(self, expression):
        res = self.browser._websocket_request('Runtime.evaluate', params={
            'expression': expression, 'returnByValue': True,
        })
        return ((res or {}).get('result') or {}).get('value')

    def run(self):
        while not self.stopped.wait(.05):
            try:
                pending = self.evaluate(PENDING_MOUSE)
                if not pending:
                    continue
                request = json.loads(pending)
                for event in request['events']:
                    self.browser._websocket_request('Input.dispatchMouseEvent', params=event)
                    time.sleep(.03)
                self.evaluate(f"window.__tl_mouse_done = {int(request['id'])}")
            except Exception:  # noqa: BLE001 - the page is loading or already closed
                _logger.debug('mouse bridge', exc_info=True)


@tagged('post_install', '-at_install')
class TestTimelineMultiTours(HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        previous = os.environ.get('TZ')
        os.environ['TZ'] = 'UTC'
        time.tzset()

        def restore():
            if previous is None:
                os.environ.pop('TZ', None)
            else:
                os.environ['TZ'] = previous
            time.tzset()

        cls.addClassCleanup(restore)
        pill = cls.env[PILL]
        # the demo data (when loaded) holds the same records: start from a clean host
        pill.with_context(active_test=False).search([]).unlink()
        cls.env['test.web.gantt.pill2'].with_context(active_test=False).search([]).unlink()
        cls.today = fields.Date.today()
        cls.records = pill._tl_build_host_records(today=cls.today, tz_offset_hours=0)
        cls.rtl_user = pill._tl_rtl_user()
        cls.restricted = cls.env['res.users'].create({
            'name': 'Restricted editor',
            'login': RESTRICTED,
            'password': RESTRICTED,
            'group_ids': [Command.set([cls.env.ref('base.group_user').id])],
        })

    def setUp(self):
        super().setUp()
        self.browser_size = DESKTOP
        self.touch_enabled = False
        self.env.ref('base.user_admin').lang = 'en_US'

    # -- helpers --------------------------------------------------------------------------------

    def _tour(self, host, name, login='admin', size=DESKTOP, touch=False):
        self.browser_size = size
        self.touch_enabled = touch
        path = host if host.startswith('/') else HOST_ACTION.format(host)
        original = ChromeBrowser._wait_code_ok

        def wait_code_ok(browser, *args, **kwargs):
            bridge = MouseBridge(browser)
            bridge.start()
            try:
                return original(browser, *args, **kwargs)
            finally:
                bridge.stopped.set()
                bridge.join(5)

        with patch.object(ChromeBrowser, '_wait_code_ok', wait_code_ok):
            self.start_tour(path, name, login=login)

    # -- notes on the earlier parts (R1) ---------------------------------------------------------

    def test_a1_tour_group_header_gesture(self):
        count = self.env[PILL].search_count([])
        self._tour('h3', 'timeline_002b3_a1_group_header_gesture')
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_a2_tour_record_header(self):
        self._tour('h3', 'timeline_002b3_a2_record_header')

    def test_a2_tour_group_header_gesture_phone(self):
        self._tour('h3', 'timeline_002b3_a2_group_header_gesture_phone', size=PHONE)
