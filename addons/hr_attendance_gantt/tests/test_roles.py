# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Backend scenarios of the matrix of roles (002d3 R21, A57 to A63): what the Community's rules let
each role do on the server, cell by cell, where the Gantt view shows no control for it (no New, no
handles, no Save & Close, no Delete): the write is refused. One user per role, groups set
explicitly (``make_role_users``): No role, Self, Team, All, All with the Employees officer
group, and the administrator. What a user sees is asserted by the tours of
``test_actions_tours.py``.

The matrix cell by cell (the tour that shows it is named in ``test_actions_tours.py``):

* the Attendances application and its top bar menus: ``test_r21_menus``;
* the rows of the management action: ``test_a57_to_a61_rows``;
* the contract filters: ``test_contract_filters.py`` (the server's group on the search field);
* New and creating from a cell: ``test_r21_create``;
* moving and resizing: ``test_r21_write``; a validated attendance of Self: ``test_a63_validated``;
* the record dialog's footer and the status bar: ``test_r21_form_controls``;
* the warning and its link: ``test_contract_warning.py`` (reads by
  role), ``test_r21_form_controls``.
"""
from datetime import datetime

from lxml import etree
from odoo.exceptions import AccessError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from .actions_fixtures import PEER_NAME, make_role_users
from .hr_rows_fixtures import HrRowsCase

NEW = (datetime(2026, 11, 12, 7, 0), datetime(2026, 11, 12, 9, 0))
DAY = ('2026-11-10 23:00', '2026-11-11 23:00', '2026-11-11 10:00')
ATTENDANCES = 'hr_attendance.'


@tagged('post_install', '-at_install')
class TestRoles(HrRowsCase, TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Attendance = cls.env['hr.attendance']
        cls.users = make_role_users(cls.env)
        # the administrator of Attendances, who is not one of the five role users
        cls.admin = cls.env.ref('base.user_admin')
        cls.admin.write({'group_ids': [
            (4, cls.env.ref('hr_attendance.group_hr_attendance_manager').id),
            (4, cls.env.ref('hr.group_hr_manager').id)]})
        cls.peer = cls.env['hr.employee'].search([('name', '=', PEER_NAME)])

    def _own(self, login):
        return self.users[login].employee_id

    def _attendance_of(self, employee):
        return self.Attendance.search([('employee_id', '=', employee.id)])

    def _as(self, user, employee):
        """The attendance of ``employee`` read as ``user`` (empty when the rules hide it)."""
        return self.Attendance.with_user(user).search([('employee_id', '=', employee.id)])

    def _create(self, user, employee):
        return self.Attendance.with_user(user).create({
            'employee_id': employee.id, 'check_in': NEW[0], 'check_out': NEW[1]})

    def _refused(self, user, employee):
        with self.assertRaises(AccessError), self.cr.savepoint():
            self._create(user, employee)
        self.assertFalse(self.Attendance.search([
            ('employee_id', '=', employee.id), ('check_in', '=', NEW[0])]), 'nothing was created')

    def _created(self, user, employee):
        created = self._create(user, employee)
        self.assertEqual(created.employee_id, employee)
        created.with_context(skip_time_rules=True).sudo().unlink()

    # -- the menus ---------------------------------------------------------------------------

    def _menus(self, user):
        """The menus of the Attendances application the user reaches, by their technical name."""
        visible = self.env['ir.ui.menu'].with_user(user)._visible_menu_ids()
        names = {
            'root': 'menu_hr_attendance_root',
            'mine': 'menu_hr_attendance_my_attendances',
            'management': 'menu_hr_attendance_view_attendances_management',
            'kiosk': 'menu_action_open_form',
            'reporting': 'menu_hr_attendance_reporting',
            'configuration': 'menu_hr_attendance_configuration',
        }
        return {
            key for key, name in names.items()
            if self.env.ref(ATTENDANCES + name).id in visible}

    def test_r21_menus(self):
        """R21 rows 1 and 2: the Attendances application for Self and above, never for No role
        (the Employees application only); My Attendances for Self and above; Management and Kiosk
        Mode for All and above; Configuration for the administrator."""
        everything = {'root', 'mine', 'management', 'kiosk', 'reporting'}
        self.assertEqual(self._menus(self.users['gantt_none']), set())
        self.assertEqual(self._menus(self.users['gantt_self']), {'root', 'mine'})
        team = self._menus(self.users['gantt_team'])
        self.assertIn('root', team)
        self.assertNotIn('mine', team)
        self.assertNotIn('management', team)
        self.assertEqual(self._menus(self.users['gantt_all']), everything)
        self.assertEqual(self._menus(self.users['gantt_allhr']), everything)
        self.assertEqual(self._menus(self.admin), everything | {'configuration'})

    # -- the rows of the management action (002d2 R14, R22) ----------------------------------

    def _rows(self, user):
        model = self.Attendance.with_user(user)
        return self.row_names(self.get_data(*DAY, user_domain=[], model=model))

    def test_a57_to_a61_rows(self):
        """Rows by address: No role and Self their own; Team the employees they manage; All and
        above every employee, 20 to a page."""
        self.assertEqual(self._rows(self.users['gantt_none']), ['Gantt Role None'])
        self.assertEqual(self._rows(self.users['gantt_self']), ['Gantt Role Self'])
        self.assertEqual(self._rows(self.users['gantt_team']), [PEER_NAME, 'Gantt Role Team'])
        everyone = self.env['hr.employee'].search([], order='name, id', limit=20)
        for user in (self.users['gantt_all'], self.users['gantt_allhr'], self.admin):
            with self.subTest(user=user.login):
                result = self.get_data(
                    *DAY, user_domain=[], model=self.Attendance.with_user(user))
                self.assertEqual(
                    [group['employee_id'][0] for group in result['groups']], everyone.ids)
                self.assertEqual(result['length'], self.env['hr.employee'].search_count([]))

    # -- New, creating from a cell (R14, R16) ---------------------------------------------------

    def test_r21_create(self):
        """No role cannot create at all; Self for their own employee; Team for the employees they
        manage; All and above for every employee. Any other write is refused by the Community."""
        none, self_, team = (
            self.users[login] for login in ('gantt_none', 'gantt_self', 'gantt_team'))
        for target in (self._own('gantt_none'), self.peer):
            with self.subTest(user='gantt_none', target=target.name):
                self._refused(none, target)
        self._created(self_, self._own('gantt_self'))
        for target in (self.peer, self._own('gantt_team'), self._own('gantt_all')):
            with self.subTest(user='gantt_self', target=target.name):
                self._refused(self_, target)
        for target in (self._own('gantt_team'), self.peer):
            with self.subTest(user='gantt_team', managed=target.name):
                self._created(team, target)
        for target in (self._own('gantt_all'), self._own('gantt_self'), self._own('gantt_none')):
            with self.subTest(user='gantt_team', refused=target.name):
                self._refused(team, target)
        for user in (self.users['gantt_all'], self.users['gantt_allhr'], self.admin):
            for target in (self._own('gantt_none'), self._own('gantt_team'), self.peer):
                with self.subTest(user=user.login, target=target.name):
                    self._created(user, target)

    # -- moving, resizing and deleting (R17) ----------------------------------------------------

    def _write_refused(self, user, employee):
        attendance = self._attendance_of(employee)
        before = attendance.read(['check_in', 'check_out'])
        with self.assertRaises(AccessError), self.cr.savepoint():
            attendance.with_user(user).write({
                'check_in': datetime(2026, 11, 11, 9, 0),
                'check_out': datetime(2026, 11, 11, 11, 0)})
        attendance.invalidate_recordset()
        self.assertEqual(attendance.read(['check_in', 'check_out']), before)

    def _written(self, user, employee):
        attendance = self._attendance_of(employee)
        before = attendance.read(['check_in', 'check_out'])
        attendance.with_user(user).write({
            'check_in': datetime(2026, 11, 11, 9, 0), 'check_out': datetime(2026, 11, 11, 11, 0)})
        self.assertEqual(attendance.check_in, datetime(2026, 11, 11, 9, 0))
        # put back for the next one
        attendance.sudo().with_context(skip_time_rules=True).write(
            {'check_in': before[0]['check_in'], 'check_out': before[0]['check_out']})

    def _delete_refused(self, user, employee):
        attendance = self._attendance_of(employee)
        with self.assertRaises(AccessError), self.cr.savepoint():
            attendance.with_user(user).unlink()
        self.assertTrue(attendance.exists())

    def test_r21_write(self):
        """Moving and resizing writes: refused for No role; Self for their own attendance (while
        it is not validated: A63) and never for another; Team for their employees'; All and above
        for every one. Delete (the dialog's button) is for Team and above, on their employees'."""
        for target in ('gantt_none', 'gantt_self'):
            with self.subTest(user='gantt_none', target=target):
                self._write_refused(self.users['gantt_none'], self._own(target))
        self._written(self.users['gantt_self'], self._own('gantt_self'))
        for employee in (self.peer, self._own('gantt_team'), self._own('gantt_none')):
            with self.subTest(user='gantt_self', target=employee.name):
                self.assertFalse(self._as(self.users['gantt_self'], employee))
                self._write_refused(self.users['gantt_self'], employee)
        for employee in (self.peer, self._own('gantt_team')):
            with self.subTest(user='gantt_team', managed=employee.name):
                self._written(self.users['gantt_team'], employee)
        for employee in (self._own('gantt_all'), self._own('gantt_self')):
            with self.subTest(user='gantt_team', refused=employee.name):
                self.assertFalse(self._as(self.users['gantt_team'], employee))
                self._write_refused(self.users['gantt_team'], employee)
        for user in (self.users['gantt_all'], self.users['gantt_allhr'], self.admin):
            for employee in (self.peer, self._own('gantt_none'), self._own('gantt_self')):
                with self.subTest(user=user.login, target=employee.name):
                    self._written(user, employee)
        # Delete
        for login in ('gantt_none', 'gantt_self'):
            with self.subTest(delete=login):
                self._delete_refused(self.users[login], self._own(login))
        self._delete_refused(self.users['gantt_team'], self._own('gantt_all'))
        for user, employee in (
            (self.users['gantt_team'], self.peer),
            (self.users['gantt_all'], self._own('gantt_none')),
            (self.users['gantt_allhr'], self._own('gantt_self')),
            (self.admin, self._own('gantt_team')),
        ):
            with self.subTest(delete=user.login, target=employee.name):
                attendance = self._attendance_of(employee)
                attendance.with_user(user).unlink()
                self.assertFalse(attendance.exists())

    def test_a63_validated(self):
        """A63, E3: Self writes their own attendance while the company validates nothing; once the
        company validates attendances and the administrator validated it, the write is refused and
        the attendance keeps its values (the same cell is asserted in ``test_open_moves.py``)."""
        user = self.users['gantt_self']
        attendance = self._attendance_of(user.employee_id)
        company = user.company_id
        self.assertEqual(company.attendance_validation, 'no_validation')
        self._written(user, user.employee_id)
        company.attendance_validation = 'manual_validation'
        attendance.sudo().write({'state': 'validated'})
        self._write_refused(user, user.employee_id)
        attendance.sudo().write({'state': 'draft'})
        self._written(user, user.employee_id)

    # -- the record dialog's controls (R9) ------------------------------------------------------

    def _form(self, user):
        form = self.env.ref('hr_attendance.hr_attendance_create_view_form')
        views = self.Attendance.with_user(user).get_views([(form.id, 'form')])
        return etree.fromstring(views['views']['form']['arch'])

    def test_r21_form_controls(self):
        """The creation form's arch for each role: the status bar's Validate and Refuse buttons
        for Team and above only (the server removes them for the others), the employee field read
        only for No role and Self, and the footer's three buttons (the shown ones are decided by
        ``can_edit`` and ``is_manager``, computed per attendance)."""
        def buttons(form):
            return {node.get('name') for node in form.iter('button') if node.get('name')}

        for login in ('gantt_none', 'gantt_self'):
            with self.subTest(login=login):
                form = self._form(self.users[login])
                self.assertFalse({'action_validate', 'action_refuse'} & buttons(form))
                employees = form.xpath("//field[@name='employee_id']")
                self.assertEqual([node.get('readonly') for node in employees], ['1'])
        for user in (
            self.users['gantt_team'], self.users['gantt_all'], self.users['gantt_allhr'],
            self.admin,
        ):
            with self.subTest(login=user.login):
                form = self._form(user)
                self.assertLessEqual({'action_validate', 'action_refuse'}, buttons(form))
                self.assertIn('unlink', buttons(form))

    def test_r21_can_edit_and_manage(self):
        """The two flags the footer follows (Save & Close for ``can_edit``, Delete for
        ``is_manager``), per role, on the user's own attendance (M56, M62, M68, M74, M80): No role
        reads it only (Discard alone), Self edits it, Team (the manager of their employee) and
        above edit and manage it."""
        flags = {}
        for login, user in self.users.items():
            attendance = self._attendance_of(user.employee_id).with_user(user)
            flags[login] = (attendance.can_edit, attendance.is_manager)
        self.assertEqual(flags, {
            'gantt_none': (False, False),
            'gantt_self': (True, False),
            'gantt_team': (True, True),
            'gantt_all': (True, True),
            'gantt_allhr': (True, True),
        })
        peer = self._as(self.users['gantt_team'], self.peer)
        self.assertEqual((peer.can_edit, peer.is_manager), (True, True))
