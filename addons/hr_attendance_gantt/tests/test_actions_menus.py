# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Backend scenarios of slice 002d3 about the actions, the view's identifiers and its options:
A1 (the module list and the uninstall hook), R13 (the definition), the view identifiers of
model.md (the migration), R3 (the My Attendances action) and ``action_open_details``."""
import importlib.util

from lxml import etree
from odoo.addons.hr_attendance_gantt.hooks import rename_attendance_view, restore_attendance_action
from odoo.addons.hr_attendance_gantt.models.hr_employee import HrEmployee as BridgeEmployee
from odoo.tests import tagged
from odoo.tests.common import TransactionCase
from odoo.tools import file_path
from odoo.tools.safe_eval import safe_eval

from .hr_rows_fixtures import TZ, make_whole_day_schedule

OLD_NAME = 'hr_attendance_view_gantt'
NEW_NAME = 'hr_attendance_gantt_view'


@tagged('post_install', '-at_install')
class TestActionsMenus(TransactionCase):

    def test_a1_no_new_module(self):
        modules = self.env['ir.module.module'].search([('name', 'like', '%gantt%')])
        bridges = modules.filtered(
            lambda module: {'hr', 'hr_attendance'} & set(module.dependencies_id.mapped('name'))
            or module.name in ('hr_gantt', 'hr_attendance_gantt'))
        self.assertEqual(set(bridges.mapped('name')), {'hr_gantt', 'hr_attendance_gantt'})
        self.assertEqual(set(bridges.mapped('state')), {'installed'})

    def test_a1_uninstall_hook_restores_my_attendances(self):
        mine = self.env.ref('hr_attendance.hr_attendance_my_action')
        self.assertEqual(mine.view_mode, 'calendar,gantt,list,pivot,graph')
        context, domain = mine.context, mine.domain
        restore_attendance_action(self.env)
        self.assertEqual(mine.view_mode, 'calendar,list,pivot,graph')
        self.assertEqual([mode for _id, mode in mine.views], ['calendar', 'list', 'pivot', 'graph'])
        # what the Community ships is not touched
        self.assertEqual((mine.context, mine.domain), (context, domain))
        self.assertEqual(mine.view_id, self.env.ref('hr_attendance.hr_attendance_my_calendar_view'))

    def test_a1_contract_filters_leave_with_the_bridge_view(self):
        """The filters live in the bridge's inherited view alone: without it, the Community's
        search view has none (what the uninstall removes with the module's records)."""
        search_view = self.env.ref('hr_attendance.hr_attendance_view_filter')

        def filter_names():
            arch = self.env['hr.attendance'].get_views(
                [(search_view.id, 'search')])['views']['search']['arch']
            return {node.get('name') for node in etree.fromstring(arch).iter('filter')}

        names = {'ongoing_contract', 'no_active_contract'}
        self.assertTrue(names <= filter_names())
        extension = self.env.ref('hr_attendance_gantt.hr_attendance_view_filter_contract')
        self.assertEqual(extension.inherit_id, search_view)
        extension.active = False
        self.assertFalse(names & filter_names())
        self.assertIn('check_in_filter', filter_names())

    def test_a1_monthly_action_without_the_bridge(self):
        """A1: what the Community's action has without the bridge's extension (its own method,
        reached past the bridge's) is List and Form only; the bridge adds the monthly Gantt."""
        employee = self.env['hr.employee'].create({'name': 'HRA Monthly Action', 'tz': TZ})
        community = super(BridgeEmployee, employee).action_open_last_month_attendances()
        self.assertEqual(community['views'], [[False, 'list'], [False, 'form']])
        monthly = self.env.ref(
            'hr_attendance_gantt.hr_attendance_gantt_view_employee_monthly_hours')
        bridged = employee.action_open_last_month_attendances()
        self.assertEqual(bridged['views'], [*community['views'], [monthly.id, 'gantt']])
        # the rest of the Community's action is untouched
        self.assertEqual(
            {key: value for key, value in bridged.items() if key != 'views'},
            {key: value for key, value in community.items() if key != 'views'})

    def test_r4_monthly_action_views(self):
        """R4: List, Form, then the monthly Gantt view; the view is the Month copy with the
        monthly variant, and the model's default Gantt view stays the main one."""
        employee = self.env['hr.employee'].create({'name': 'HRA Monthly', 'tz': TZ})
        action = employee.action_open_last_month_attendances()
        monthly = self.env.ref(
            'hr_attendance_gantt.hr_attendance_gantt_view_employee_monthly_hours')
        self.assertEqual(
            action['views'], [[False, 'list'], [False, 'form'], [monthly.id, 'gantt']])
        self.assertEqual(action['res_model'], 'hr.attendance')
        self.assertEqual(action['context'], {'group_by': ['check_in:week']})
        copy = self.env.ref('hr_attendance_gantt.hr_attendance_gantt_view_default_scale_month')
        self.assertEqual((monthly.mode, monthly.inherit_id), ('primary', copy))
        combined = monthly._get_combined_arch()
        self.assertEqual(combined.get('js_class'), 'monthly_attendance_gantt')
        self.assertEqual(
            (combined.get('default_range'), combined.get('default_scale')), ('month', 'month'))
        # the copies are not the model's default Gantt view
        default = self.env['hr.attendance'].get_views([(False, 'gantt')])['views']['gantt']
        self.assertEqual(
            default['id'], self.env.ref('hr_attendance_gantt.hr_attendance_gantt_view').id)

    def test_a3_my_attendances_modes(self):
        mine = self.env.ref('hr_attendance.hr_attendance_my_action')
        calendar = self.env.ref('hr_attendance.hr_attendance_my_calendar_view')
        self.assertEqual(
            [mode for _id, mode in mine.views], ['calendar', 'gantt', 'list', 'pivot', 'graph'])
        # the calendar is the first view and keeps the Community's calendar view
        self.assertEqual(list(mine.views[0]), [calendar.id, 'calendar'])
        self.assertEqual(mine.view_id, calendar)
        self.assertEqual(safe_eval(mine.context), {'search_default_groupby_week': 1})
        self.assertEqual(mine.domain, "[('employee_id.user_id', '=', uid)]")
        # the Gantt mode has no view of its own: the model's default one is used, the original
        self.assertEqual(mine.view_ids.mapped('view_mode'), [])
        default = self.env['hr.attendance'].get_views([(False, 'gantt')])['views']['gantt']
        self.assertEqual(
            default['id'], self.env.ref('hr_attendance_gantt.hr_attendance_gantt_view').id)

    def test_r13_definition_options(self):
        view = self.env.ref('hr_attendance_gantt.hr_attendance_gantt_view')
        root = etree.fromstring(view.arch)
        form = self.env.ref('hr_attendance.hr_attendance_create_view_form')
        self.assertEqual(root.get('form_view_id'), str(form.id))
        self.assertEqual(root.get('plan'), '0')
        self.assertEqual(root.get('js_class'), 'attendance_gantt')

    def test_r13_month_copy(self):
        copy = self.env.ref('hr_attendance_gantt.hr_attendance_gantt_view_default_scale_month')
        original = self.env.ref('hr_attendance_gantt.hr_attendance_gantt_view')
        self.assertEqual((copy.mode, copy.inherit_id), ('primary', original))
        self.assertGreater(copy.priority, original.priority)
        combined = copy._get_combined_arch()
        self.assertEqual(
            (combined.get('default_range'), combined.get('default_scale')), ('month', 'month'))
        # everything else is the original's
        base = etree.fromstring(original.arch)
        for name, value in base.attrib.items():
            if name not in ('default_range', 'default_scale'):
                self.assertEqual(combined.get(name), value, name)

    def test_migration_renames_view(self):
        view = self.env.ref('hr_attendance_gantt.hr_attendance_gantt_view')
        self.env.flush_all()
        cr = self.env.cr
        cr.execute(
            "UPDATE ir_model_data SET name = %s WHERE module = 'hr_attendance_gantt' AND name = %s",
            [OLD_NAME, NEW_NAME])
        self.assertEqual(cr.rowcount, 1)

        def row_ids(name):
            cr.execute(
                "SELECT res_id FROM ir_model_data WHERE module = 'hr_attendance_gantt' "
                "AND name = %s", [name])
            return [res_id for (res_id,) in cr.fetchall()]

        self.assertEqual((row_ids(OLD_NAME), row_ids(NEW_NAME)), ([view.id], []))
        # the script that the update runs, loaded from its file
        path = file_path('hr_attendance_gantt/migrations/20.0.1.1.0/pre-migrate.py')
        spec = importlib.util.spec_from_file_location('hag_pre_migrate', path)
        script = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(script)
        script.migrate(cr, '20.0.1.0.0')
        self.assertEqual((row_ids(OLD_NAME), row_ids(NEW_NAME)), ([], [view.id]))
        # a second run, and a database that never had the old name, change nothing
        rename_attendance_view(cr)
        self.assertEqual((row_ids(OLD_NAME), row_ids(NEW_NAME)), ([], [view.id]))

    def test_migration_keeps_the_new_row_when_both_exist(self):
        cr = self.env.cr
        cr.execute(
            "INSERT INTO ir_model_data (module, name, model, res_id, noupdate) "
            "VALUES ('hr_attendance_gantt', %s, 'ir.ui.view', 0, false)", [OLD_NAME])
        rename_attendance_view(cr)
        cr.execute(
            "SELECT count(*) FROM ir_model_data WHERE module = 'hr_attendance_gantt' "
            "AND name IN (%s, %s)", [OLD_NAME, NEW_NAME])
        self.assertEqual(cr.fetchone()[0], 2)

    def test_action_open_details(self):
        schedule = make_whole_day_schedule(self.env, 'HRA Details 40 hours/week')
        employee = self.env['hr.employee'].create({
            'name': 'HRA Details', 'tz': TZ, 'resource_calendar_id': schedule.id})
        Attendance = self.env['hr.attendance'].with_context(skip_time_rules=True)
        first = Attendance.create({
            'employee_id': employee.id, 'check_in': '2026-11-11 07:00:00',
            'check_out': '2026-11-11 08:00:00'})
        second = Attendance.create({
            'employee_id': employee.id, 'check_in': '2026-11-11 09:00:00',
            'check_out': '2026-11-11 10:00:00'})
        form = self.env.ref('hr_attendance.hr_attendance_view_form')
        action = first.action_open_details()
        self.assertEqual(action['type'], 'ir.actions.act_window')
        self.assertEqual(action['res_model'], 'hr.attendance')
        self.assertEqual(action['res_id'], first.id)
        self.assertEqual(action['views'], [(form.id, 'form')])
        self.assertEqual(action['view_mode'], 'form')
        # not the creation form, which the Gantt dialog uses
        self.assertNotEqual(
            form, self.env.ref('hr_attendance.hr_attendance_create_view_form'))
        with self.assertRaises(ValueError):
            (first | second).action_open_details()
