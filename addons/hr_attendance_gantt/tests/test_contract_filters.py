# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Backend scenarios of slice 002d3 about the two contract filters (R6): the computation of
"active contract today" (A16, A17), the filters as conditions on the employee (002d2 R14) and
their absence below the officer group."""
from freezegun import freeze_time
from lxml import etree
from odoo.exceptions import AccessError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from .actions_fixtures import make_role_users
from .hr_rows_fixtures import R13_domain, make_whole_day_schedule, utc

PREFIX = 'HRC '
CLOCK = '2026-11-11 12:00:00'
PERIOD = ('2026-11-10 23:00:00', '2026-11-11 23:00:00')
SPEC = {'employee_id': {'fields': {'display_name': {}}}, 'check_in': {}, 'check_out': {}}

# name -> (contract start, contract end) as of the clock 11 November 2026
CONTRACTS = {
    'Ongoing': ('2026-01-01', None),
    'Ends today': ('2026-01-01', '2026-11-11'),
    'Ended yesterday': ('2026-01-01', '2026-11-10'),
    'Starts today': ('2026-11-11', None),
    'Starts tomorrow': ('2026-11-12', None),
    'No contract': (None, None),
}
TRUE_SET = {'Ongoing', 'Ends today', 'Starts today'}


@tagged('post_install', '-at_install')
class TestContractFilters(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.schedule = make_whole_day_schedule(cls.env, PREFIX + '40 hours/week')
        cls.Attendance = cls.env['hr.attendance'].with_context(tz='Europe/Brussels')
        cls.employees = {name: cls.make(name, *dates) for name, dates in CONTRACTS.items()}
        # the active version has no contract; an archived one has an ongoing contract
        cls.archived = cls.make('Archived version', None, None)
        cls.env['hr.version'].create({
            'employee_id': cls.archived.id, 'date_version': '2026-06-01',
            'contract_date_start': '2026-01-01', 'active': False})

    @classmethod
    def make(cls, name, start, end, **values):
        employee = cls.env['hr.employee'].create({
            'name': PREFIX + name, 'tz': 'Europe/Brussels',
            'resource_calendar_id': cls.schedule.id,
            'contract_date_start': start, 'contract_date_end': end,
            'date_version': start or '2026-01-01', **values,
        })
        cls.env['hr.attendance'].with_context(skip_time_rules=True).create({
            'employee_id': employee.id,
            'check_in': '2026-11-11 07:00:00', 'check_out': '2026-11-11 09:00:00'})
        return employee

    def names(self, attendances):
        return {a.employee_id.name.removeprefix(PREFIX) for a in attendances}

    def search(self, value, model=None, operator='='):
        model = self.Attendance if model is None else model
        return model.search([
            ('employee_id.name', '=like', PREFIX + '%'), ('has_active_contract', operator, value)])

    def test_a16_filter_computation(self):
        with freeze_time(CLOCK):
            kept = self.names(self.search(True))
            dropped = self.names(self.search(False))
            negated = self.names(self.search(True, operator='!='))
            listed = self.names(self.search([True], operator='in'))
            both = self.names(self.search([True, False], operator='in'))
        everyone = set(CONTRACTS) | {'Archived version'}
        self.assertEqual(kept, TRUE_SET)
        self.assertEqual(dropped, everyone - TRUE_SET)
        # an archived version does not count
        self.assertIn('Archived version', dropped)
        self.assertEqual(negated, dropped)
        self.assertEqual(listed, kept)
        self.assertEqual(both, everyone)

    def test_a16_officer_without_version_rights(self):
        users = make_role_users(self.env, schedule=self.schedule)
        team = users['gantt_team']
        with self.assertRaises(AccessError):
            self.env['hr.version'].with_user(team).search([('contract_date_start', '!=', False)])
        # the team's attendances: the officer is the attendance manager of the peer only
        peer = self.env['hr.employee'].search([('name', '=', 'Gantt Role Peer')])
        bare = self.make('Bare', None, None, attendance_manager_id=team.id)
        ours = [('employee_id', 'in', (peer | bare).ids)]
        with freeze_time(CLOCK):
            as_team = self.Attendance.with_user(team)
            kept = as_team.search(ours + [('has_active_contract', '=', True)])
            dropped = as_team.search(ours + [('has_active_contract', '=', False)])
            everything = as_team.search([('has_active_contract', 'in', [True, False])])
        self.assertEqual(kept.employee_id, peer)
        self.assertEqual(dropped.employee_id, bare)
        # only the attendances the rules let the user read
        self.assertEqual(everything, as_team.search([]))
        self.assertNotIn(self.employees['Ongoing'], everything.employee_id)

    def test_a17_west_of_utc(self):
        # 4:00 UTC on 11 November: still the 10th in New York, already the 11th in Brussels
        with freeze_time('2026-11-11 04:00:00'):
            new_york = self.Attendance.with_context(tz='America/New_York')
            brussels = self.Attendance.with_context(tz='Europe/Brussels')
            self.assertEqual(
                self.names(self.search(False, new_york)) & {'Starts today', 'Ongoing'},
                {'Starts today'})
            self.assertEqual(
                self.names(self.search(True, brussels)) & {'Starts today', 'Ongoing'},
                {'Starts today', 'Ongoing'})
            # a contract that ended on the 10th still counts in New York, not in Brussels
            self.assertIn('Ended yesterday', self.names(self.search(True, new_york)))
            self.assertIn('Ended yesterday', self.names(self.search(False, brussels)))

    def test_a17_zone_falls_back_to_the_user(self):
        self.env.user.tz = 'Pacific/Kiritimati'
        no_zone = self.env['hr.attendance']
        with freeze_time('2026-11-11 10:00:00'):
            # 12 November there: the contract that ends on the 11th is over, tomorrow's has begun
            kept = self.names(self.search(True, no_zone))
        self.assertEqual(kept, {'Ongoing', 'Starts today', 'Starts tomorrow'})

    def test_r6_filters_concern_employee(self):
        base = R13_domain(utc('2026-11-10 23:00'), utc('2026-11-11 23:00'), utc('2026-11-11 10:00'))
        like = [('employee_id.name', '=like', PREFIX + '%')]
        # moving an attendance away from the period leaves its employee without one
        self.employees['Ongoing'].attendance_ids.write({
            'check_in': '2026-10-01 07:00:00', 'check_out': '2026-10-01 09:00:00'})
        with freeze_time(CLOCK):
            for value, expected in ((True, TRUE_SET), (False, set(CONTRACTS) - TRUE_SET)):
                user_domain = like + [('has_active_contract', '=', value)]
                model = self.Attendance.with_context(user_domain=user_domain)
                result = model.get_gantt_data(
                    base + user_domain, ['employee_id'], SPEC, limit=20,
                    start_date=PERIOD[0], stop_date=PERIOD[1], scale='day')
                rows = {g['employee_id'][1].removeprefix(PREFIX) for g in result['groups']}
                expected = expected | ({'Archived version'} if not value else set())
                self.assertEqual(rows, expected)
                self.assertEqual(result['length'], len(expected))
        self.assertIn('Ongoing', TRUE_SET)

    def test_r6_filters_hidden_below_officer(self):
        users = make_role_users(self.env, schedule=self.schedule)
        names = {'ongoing_contract', 'no_active_contract'}
        search_view = self.env.ref('hr_attendance.hr_attendance_view_filter')

        def filters(user):
            arch = self.env['hr.attendance'].with_user(user).get_views(
                [(search_view.id, 'search')])['views']['search']['arch']
            return {f.get('name') for f in etree.fromstring(arch).iter('filter')} & names

        self.assertEqual(filters(users['gantt_self']), set())
        self.assertEqual(filters(users['gantt_none']), set())
        for login in ('gantt_team', 'gantt_all', 'gantt_allhr'):
            self.assertEqual(filters(users[login]), names, login)
        self.assertEqual(filters(self.env.ref('base.user_admin')), names)
