# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from lxml import etree
from odoo.addons.hr_attendance_gantt.hooks import restore_attendance_action
from odoo.tests.common import TransactionCase
from odoo.tools import file_path
from odoo.tools.safe_eval import safe_eval


def _community_action_values():
    """The fields of the management action as the Community module's data file ships them."""
    tree = etree.parse(file_path('hr_attendance/views/hr_attendance_view.xml'))
    record = tree.xpath('//record[@id="hr_attendance_action"]')[0]
    return {field.get('name'): field.text for field in record.findall('field')}


class TestAction(TransactionCase):
    def setUp(self):
        super().setUp()
        self.action = self.env.ref('hr_attendance.hr_attendance_action')

    def test_a4_action_modes_and_context(self):
        community = _community_action_values()
        self.assertEqual(self.action.view_mode, 'gantt,list,form')
        views = self.action.view_ids.sorted('sequence')
        self.assertEqual(views[0].view_mode, 'gantt')
        self.assertEqual(views[0].sequence, 0)
        self.assertEqual(
            views[0].view_id, self.env.ref('hr_attendance_gantt.hr_attendance_gantt_view'))
        self.assertEqual([mode for _id, mode in self.action.views], ['gantt', 'list', 'form'])
        # only the grouping by Employee is a search default
        self.assertEqual(safe_eval(self.action.context), {'search_default_employee': 1})
        search_view = self.env.ref('hr_attendance.hr_attendance_view_filter')
        grouping = etree.fromstring(search_view.arch).xpath('//filter[@name="employee"]')[0]
        self.assertEqual(safe_eval(grouping.get('context')), {'group_by': 'employee_id'})
        self.assertEqual(self.action.name, 'Attendances')
        self.assertEqual(self.action.search_view_id, search_view)
        self.assertEqual(
            str(self.action.help or '').strip(), (community['help'] or '').strip())
        self.assertEqual(self.action.res_model, 'hr.attendance')

    def test_a5_view_definition(self):
        view = self.env.ref('hr_attendance_gantt.hr_attendance_gantt_view')
        self.assertEqual(view.type, 'gantt')
        self.assertEqual(view.model, 'hr.attendance')
        root = etree.fromstring(view.arch)
        self.assertEqual(root.tag, 'gantt')
        self.assertEqual(len(root), 0)
        self.assertEqual(dict(root.attrib), {
            'js_class': 'attendance_gantt',
            'string': 'Days',
            'date_start': 'check_in',
            'date_stop': 'check_out',
            'color': 'wet_color',
            'default_group_by': 'employee_id',
            'groups_limit': '20',
            'default_range': 'day',
            'default_scale': 'day',
            'form_view_id': str(self.env.ref('hr_attendance.hr_attendance_create_view_form').id),
            'plan': '0',
            'precision': (
                "{'day': 'hour:quarter', 'week': 'day:quarter', "
                "'month': 'day:half', '2weeks': 'day:half'}"),
            'display_unavailability': '1',
            'progress_bar': 'employee_id',
        })
        # the definition passes the validation of the view type
        view._check_xml()
        # the only Gantt view of the model that is not a copy of it
        self.assertEqual(
            self.env['ir.ui.view'].search_count(
                [('model', '=', 'hr.attendance'), ('type', '=', 'gantt'),
                 ('mode', '=', 'primary'), ('inherit_id', '=', False)]), 1)

    def test_a3_uninstall_restores_action(self):
        community = _community_action_values()
        restore_attendance_action(self.env)
        self.assertEqual(self.action.view_mode, 'list,form')
        self.assertEqual(self.action.context, community['context'])
        self.assertEqual(
            safe_eval(self.action.context),
            {'search_default_groupby_month': 1, 'search_default_employee': 2})

    def test_a3_dependency_chain(self):
        module_model = self.env['ir.module.module']
        bridge = module_model.search([('name', '=', 'hr_attendance_gantt')])
        employees = module_model.search([('name', '=', 'hr_gantt')])
        self.assertIn('hr_gantt', bridge.dependencies_id.mapped('name'))
        self.assertIn(bridge, employees.downstream_dependencies())
        self.assertNotIn(employees, bridge.downstream_dependencies())
