# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from lxml import etree
from odoo.tests.common import TransactionCase


class TestViews(TransactionCase):
    def _arch(self, xmlid):
        return etree.fromstring(self.env.ref(xmlid).arch)

    def test_a02_views(self):
        leave = self._arch('hr_holidays_gantt.hr_leave_gantt_view')
        self.assertEqual(leave.get('js_class'), 'hr_holidays_gantt_manager_hr_leave')
        self.assertEqual(leave.get('string'), 'Days')
        self.assertEqual(leave.get('default_range'), 'month')
        self.assertEqual(leave.get('groups_limit'), '20')
        self.assertEqual(leave.get('scales'), 'week,month,quarter')
        self.assertEqual(leave.get('progress_bar'), 'employee_id')
        self.assertEqual(leave.get('plan'), '0')
        report = self._arch('hr_holidays_gantt.hhg_report_gantt_view')
        self.assertEqual(report.get('js_class'), 'hr_holidays_report_gantt')
        self.assertEqual(report.get('string'), 'Time Off')
        self.assertEqual(report.get('default_range'), 'month')
        self.assertEqual(report.get('groups_limit'), '20')
        self.assertEqual(report.get('sample'), '1')
        self.assertEqual(report.get('color'), 'employee_id')
        self.assertIsNone(report.get('progress_bar'))
        self.assertIsNone(report.get('scales'))
        for option in ('create', 'edit', 'delete'):
            self.assertEqual(report.get(option), '0')
        self.assertEqual(
            self.env.ref('hr_holidays_gantt.hr_leave_gantt_view').model, 'hr.leave')
        self.assertEqual(
            self.env.ref('hr_holidays_gantt.hhg_report_gantt_view').model,
            'hr.leave.report.calendar',
        )

    def test_a38_decorations(self):
        leave = self._arch('hr_holidays_gantt.hr_leave_gantt_view')
        decorations = {
            name: value for name, value in leave.attrib.items()
            if name.startswith('decoration-')
        }
        self.assertEqual(decorations, {
            'decoration-danger': "state == 'refuse'",
            'decoration-info': "state in ('confirm', 'validate1')",
            'decoration-secondary': "state == 'cancel'",
        })
        report = self._arch('hr_holidays_gantt.hhg_report_gantt_view')
        self.assertFalse([name for name in report.attrib if name.startswith('decoration-')])
