# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the editing behaviours of the Gantt view (slice 002b).

The browser inherits the time zone of the test process, pinned to UTC here, and the records are
built around the date of that zone with a zero offset, so the browser and the records agree on
what today is. A scenario that changes the database runs inside the test's own savepoint, which
is rolled back after it: every test starts from the records of `setUpClass`.
"""
import os
import time
from datetime import datetime, timedelta

from odoo import Command, fields
from odoo.tests import HttpCase, tagged

HOST_ACTION = '/odoo/action-test_web_gantt.host_action_{}'
PILL = 'test.web.gantt.pill'
DESKTOP = '1600x900'
PHONE = '390x844'
RESTRICTED = 'restricted_editor'


@tagged('post_install', '-at_install')
class TestTimelineEditTours(HttpCase):

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
        self.start_tour(path, name, login=login)

    def _at(self, days, clock='00:00'):
        """The datetime (UTC) of `clock` on the day `days` after today."""
        hour, minute = (int(part) for part in clock.split(':'))
        day = self.today + timedelta(days=days)
        return datetime(day.year, day.month, day.day, hour, minute)

    def _fresh(self, record):
        record.invalidate_recordset()
        return record

    def _pill(self, name):
        found = self.env[PILL].search([('name', '=', name)])
        self.assertEqual(len(found), 1, name)
        return found

    # -- selection and clicks -------------------------------------------------------------------

    def test_002b_a8_tour_selection_dialog(self):
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b_a8_selection_dialog')
        self.assertEqual(self.env[PILL].search_count([]), count, 'Discard created a record')

    def test_002b_a12_tour_edge_scroll(self):
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b_a12_edge_scroll')
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_002b_a15_a28_tour_plan_beta_row(self):
        self._tour('h2', 'timeline_002b_a15_a28_plan_beta_row')
        unscheduled = self._fresh(self._pill('Unscheduled'))
        self.assertEqual(unscheduled.date_start, self._at(0))
        self.assertEqual(unscheduled.date_stop, self._at(1))
        self.assertEqual(unscheduled.parent_id, self.records['Beta'])

    def test_002b_a29b_tour_plan_by_row_click(self):
        self._tour('h1', 'timeline_002b_a29b_plan_by_row_click')
        unscheduled = self._fresh(self._pill('Unscheduled'))
        self.assertEqual(unscheduled.date_start, self._at(3))
        self.assertEqual(unscheduled.date_stop, self._at(4))

    def test_002b_a31_tour_create_new_in_plan(self):
        self._tour('h1', 'timeline_002b_a31_create_new_in_plan')
        zeta = self._pill('Zeta planned')
        self.assertEqual(zeta.date_start, self._at(3))
        self.assertEqual(zeta.date_stop, self._at(4))

    # -- opening, editing, deleting -------------------------------------------------------------

    def test_002b_a34_a35_a37_tour_open_rename(self):
        self._tour('h1', 'timeline_002b_a34_a35_a37_open_rename')
        self.assertEqual(self.records['Build'].name, 'Build 2')

    def test_002b_a38_tour_dialog_waits_for_write(self):
        self._tour('h1', 'timeline_002b_a38_dialog_waits_for_write')
        unscheduled = self._fresh(self._pill('Unscheduled'))
        self.assertEqual(unscheduled.date_start, self._at(3))

    def test_002b_a42_tour_delete(self):
        temp = self.env[PILL].create({
            'name': 'Temp', 'date_start': self._at(3, '09:00'), 'date_stop': self._at(3, '17:00'),
        })
        temp_id = temp.id
        self._tour('h18', 'timeline_002b_a42_delete')
        self.assertFalse(self.env[PILL].browse(temp_id).exists(), 'Temp is still in the database')

    def test_002b_a43_tour_keep(self):
        self._tour('h1', 'timeline_002b_a43_keep')
        self.assertTrue(self.records['Build'].exists())

    # -- restricted user ------------------------------------------------------------------------

    def test_002b_a44_tour_restricted_user(self):
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b_a44_restricted_user', login=RESTRICTED)
        # the positive control: the administrator's identical drag does select
        self._tour('h1', 'timeline_002b_a44_control_admin_drag')
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_002b_a1b_tour_explicit_yes_view_only(self):
        self._tour('h28', 'timeline_002b_a1b_explicit_yes_view_only', login=RESTRICTED)
        self.assertEqual(self._fresh(self.records['Build']).name, 'Build')

    def test_002b_a1c_tour_explicit_yes_refused(self):
        self._tour('h29', 'timeline_002b_a1c_explicit_yes_refused', login=RESTRICTED)
        self.assertEqual(self._fresh(self.records['Build']).name, 'Build')
        self.assertTrue(self.records['Build'].exists(), 'the server deleted the record')

    # -- phone ----------------------------------------------------------------------------------

    def test_002b_a45_tour_phone_taps(self):
        self._tour('h1', 'timeline_002b_a45_phone_tap_plans', size=PHONE, touch=True)
        unscheduled = self._fresh(self._pill('Unscheduled'))
        self.assertEqual(unscheduled.date_start, self._at(1))
        self.assertEqual(unscheduled.date_stop, self._at(2))
        self._tour('h18', 'timeline_002b_a45b_phone_tap_creates', size=PHONE, touch=True)

    def test_002b_a12b_tour_phone_edge_scroll(self):
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b_a12b_phone_edge_scroll', size=PHONE, touch=False)
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_002b_a46_tour_phone_long_press(self):
        self._tour('h1', 'timeline_002b_a46_phone_long_press', size=PHONE, touch=True)

    def test_002b_a47_tour_phone_popover_dialog(self):
        self._tour('h1', 'timeline_002b_a47_phone_popover_dialog', size=PHONE, touch=True)
        self.assertTrue(self.records['Build'].exists())

    def test_002b_a48_tour_phone_mouse_drag(self):
        self._tour('h1', 'timeline_002b_a48_phone_mouse_drag', size=PHONE, touch=False)

    # -- language, create, popover, date-only ---------------------------------------------------

    def test_002b_a5b_tour_new_week_monday(self):
        self.env['res.lang']._activate_lang('en_GB')
        admin = self.env.ref('base.user_admin')
        admin.lang = 'en_GB'
        self.addCleanup(lambda: setattr(admin, 'lang', 'en_US'))
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b_a5b_new_week_monday')
        self.assertEqual(self.env[PILL].search_count([]), count, 'a record was created')

    def test_002b_a27_tour_create_and_search(self):
        self._tour('h18', 'timeline_002b_a27_create_zeta')
        zeta = self._pill('Zeta')
        self.assertEqual(zeta.date_start, self._at(3))
        self.assertEqual(zeta.date_stop, self._at(4))
        self._tour('h1', 'timeline_002b_a27_create_hidden_by_search')
        zeta2 = self._pill('Zeta 2')
        self.assertEqual(zeta2.date_start, self._at(3))
        self.assertEqual(zeta2.date_stop, self._at(4))

    def test_002b_a39_tour_popover_switch(self):
        self.assertFalse(self.records['Build'].x_done)
        self._tour('h24', 'timeline_002b_a39_popover_switch')
        self.assertTrue(self._fresh(self.records['Build']).x_done)

    def test_002b_a49c_tour_plan_date_only(self):
        undated = self.env['test.web.gantt.pill2'].create({'name': 'Undated'})
        self._tour('h10', 'timeline_002b_a49c_plan_date_only')
        undated = self._fresh(undated)
        self.assertEqual(undated.date_start, self.today)
        self.assertEqual(undated.date_stop, self.today)
