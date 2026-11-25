# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from lxml import etree
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx

FORM = 'hr_holidays_gantt.hr_leave_gantt_multi_create_view'


@tagged('post_install', '-at_install')
class TestTimeOffPopoverForm(TransactionCase):
    """R4 (the popover's form), A1 (what the bridge adds), A67 (the role users)."""

    def test_a01_popover_form(self):
        view = self.env.ref(FORM)
        self.assertEqual(view.model, 'hr.leave')
        self.assertEqual(view.type, 'form')
        self.assertEqual(view.priority, 120)
        arch = etree.fromstring(view.arch)
        self.assertIsNone(arch.get('js_class'))
        # never the requests' default form: the Community's own is
        default = self.env['hr.leave'].get_view(view_type='form')
        self.assertNotEqual(default['id'], view.id)
        self.assertNotIn('o_hhg_pop_body', default['arch'])
        # the 002e variants still carry their js_class
        gantt = etree.fromstring(self.env.ref('hr_holidays_gantt.hr_leave_gantt_view').arch)
        self.assertEqual(gantt.get('js_class'), 'hr_holidays_gantt_manager_hr_leave')
        report = etree.fromstring(self.env.ref('hr_holidays_gantt.hhg_report_gantt_view').arch)
        self.assertEqual(report.get('js_class'), 'hr_holidays_report_gantt')

    def test_a01_popover_form_content(self):
        """The label icons carry the field names, the footer's fields are present, the type
        drop-down offers no "create" entry and only selectable types."""
        arch = etree.fromstring(self.env.ref(FORM).arch)
        icons = {
            icon.get('title'): icon.get('data-icon')
            for icon in arch.iterfind('.//i[@data-icon]') if icon.get('title') in
            ('Time Off Type', 'Dates', 'Description')}
        self.assertEqual(icons, {
            'Time Off Type': 'label', 'Dates': 'schedule', 'Description': 'edit'})
        fields_ = {node.get('name'): node for node in arch.iterfind('.//field')}
        for name in (
            'state', 'employee_id', 'duration_display', 'can_approve', 'can_validate',
            'can_refuse', 'can_back_to_approve', 'request_date_from', 'request_date_to',
            'request_date_from_period',
            'request_date_to_period', 'request_hour_from', 'request_hour_to',
            'work_entry_type_request_unit', 'last_several_days', 'allowed_request_durations',
            'request_duration', 'number_of_days', 'number_of_hours',
            'allocation_display_warning', 'work_entry_type_id', 'name',
        ):
            self.assertIn(name, fields_)
        kind = fields_['work_entry_type_id']
        self.assertIn("'no_create': True", kind.get('options'))
        self.assertIn("'no_open': False", kind.get('options'))
        self.assertIn('time_off_selectable', kind.get('domain'))
        self.assertIn('allowed_work_entry_type_ids', kind.get('domain'))
        self.assertEqual(fields_['name'].get('rows'), '2')
        # loads for a user, without error
        self.env['hr.leave'].with_user(fx.find_admin(self.env)).get_view(view_id=self.env.ref(FORM).id)

    def test_a67_role_groups(self):
        users = fx.make_role_users(self.env)
        for login, keys in fx.ROLE_GROUPS.items():
            user = users[login]
            held = {key for key, xmlid in fx.TIME_OFF_GROUPS.items() if user.has_group(xmlid)}
            self.assertEqual(held, set(keys), login)
            self.assertTrue(user.has_group('base.group_user'), login)
            self.assertEqual(
                user.has_group('base.group_allow_export'),
                login in ('toff_officer', 'toff_admin'), login)
        responsible = fx.TIME_OFF_GROUPS['responsible']
        self.assertFalse(users['toff_manager'].has_group(responsible))
        # the checking step stops on a mismatch
        officer = self.env.ref(fx.TIME_OFF_GROUPS['officer'])
        users['toff_emp'].sudo().write({'group_ids': [(4, officer.id)]})
        with self.assertRaises(AssertionError):
            fx.check_role_groups(self.env, users)
