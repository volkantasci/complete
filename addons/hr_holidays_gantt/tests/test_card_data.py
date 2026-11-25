# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import date, datetime, timedelta

from odoo import fields
from odoo.exceptions import AccessError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx

FIELDS = ['avatar_leave_summary', 'avatar_hours_per_week']
DASHBOARDS = {
    'week': 'hr_holidays.hr_leave_employee_view_dashboard_week',
    'month': 'hr_holidays.hr_leave_employee_view_dashboard_month',
    'year': 'hr_holidays.hr_leave_employee_view_dashboard',
}


@tagged('post_install', '-at_install')
class TestCardData(TransactionCase):
    """R18: the values the employee card reads, and the two Community calls it makes."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.users = fx.make_role_users(cls.env)
        cls.world = fx.make_demo_like(cls.env)
        cls.anita = cls.world['Anita Oliver']
        cls.mitchell = cls.world['Mitchell Admin']
        cls.peer = cls.env['hr.employee'].search([('name', '=', fx.PEER_NAME)])

    def card(self, employee, login='toff_officer'):
        """The card's one read of the public employee, as the user ``login``."""
        self.env.flush_all()
        self.env.invalidate_all()
        public = self.env['hr.employee.public'].with_user(self.users[login]).browse(employee.id)
        return public.read(FIELDS)[0]

    def test_a17_summary_lines(self):
        # Anita Oliver: 20 days allocated, 11 taken
        lines = self.card(self.anita)['avatar_leave_summary']
        legal = [line for line in lines if line['name'] == 'Legal leave employee']
        self.assertEqual(legal, [{
            'name': 'Legal leave employee', 'taken': 11, 'left': 9,
            'requires_allocation': True, 'unit': 'days'}])
        # a peer with 10 days of the compensatory type, 3 taken, and the sick type (no
        # allocation) 3 days taken; the line with the smaller time left comes first
        compensatory_type, sick_type = fx.find_type(self.env, 'CTO'), fx.find_type(self.env, 'STO')
        fx._allocate(self.env, self.peer, compensatory_type, 10)
        fx.make_leave(self.env, self.peer, compensatory_type, date(2026, 11, 2), date(2026, 11, 4))
        fx.make_leave(self.env, self.peer, sick_type, date(2026, 11, 9), date(2026, 11, 11))
        lines = self.card(self.peer)['avatar_leave_summary']
        self.assertEqual(
            [line['name'] for line in lines], [sick_type.name, compensatory_type.name])
        sick, compensatory = lines
        self.assertFalse(sick['requires_allocation'])
        self.assertEqual((sick['taken'], sick['unit']), (3, 'days'))
        self.assertEqual((compensatory['taken'], compensatory['left']), (3, 7))
        self.assertTrue(compensatory['requires_allocation'])
        lefts = [line['left'] for line in lines]
        self.assertEqual(lefts, sorted(lefts))

    def _legal_summary(self, employee):
        lines = self.card(employee)['avatar_leave_summary']
        return [line for line in lines if line['name'] == 'Legal leave employee']

    def test_a88_waiting_request_not_counted(self):
        fx.make_peer_band_records(self.env)
        states = self.env['hr.leave'].search([('employee_id', '=', self.peer.id)]).mapped('state')
        self.assertEqual(sorted(states), ['confirm', 'validate'], states)
        self.assertEqual(self._legal_summary(self.peer), [{
            'name': 'Legal leave employee', 'taken': 2, 'left': 8,
            'requires_allocation': True, 'unit': 'days'}])

    def test_a88_allocations_of_any_date(self):
        legal = fx.find_type(self.env, 'PTO')
        fx._allocate(self.env, self.peer, legal, 10)
        other = self.env['hr.leave.allocation'].with_user(fx.find_admin(self.env)).create({
            'name': 'Toff earlier year', 'employee_id': self.peer.id,
            'work_entry_type_id': legal.id, 'number_of_days': 3,
            'date_from': date(2025, 1, 1), 'date_to': date(2025, 12, 31)})
        other.action_approve()
        # Approved requests count past and future alike
        fx.make_leave(self.env, self.peer, legal, date(2026, 12, 28))
        self.assertEqual(self._legal_summary(self.peer), [{
            'name': 'Legal leave employee', 'taken': 1, 'left': 12,
            'requires_allocation': True, 'unit': 'days'}])

    def test_a17_equal_left_keeps_the_community_order(self):
        for code in ('B', 'A'):
            kind = self.env['hr.work.entry.type'].create({
                'name': f'Toff Tie {code}', 'code': f'TOFF.T{code}',
                'display_code': f'T{code}', 'color': 2, 'count_as': 'absence',
                'country_id': False, 'request_unit': 'day', 'unit_of_measure': 'day',
                'requires_allocation': False, 'leave_validation_type': 'hr'})
            fx.make_leave(
                self.env, self.peer, kind,
                date(2026, 11, 2 if code == 'B' else 3))
        officer = self.users['toff_officer']
        raw = self.env['hr.work.entry.type'].with_user(officer).search([]).get_allocation_data(
            self.peer.with_user(officer))[self.peer.with_user(officer)]
        community = [entry[0] for entry in raw if entry[0].startswith('Toff Tie')]
        lines = self.card(self.peer)['avatar_leave_summary']
        ties = [line for line in lines if line['name'].startswith('Toff Tie')]
        self.assertEqual(len(ties), 2)
        self.assertEqual(ties[0]['left'], ties[1]['left'])
        self.assertEqual([line['name'] for line in ties], community)

    def test_employees_officer_without_time_off_group(self):
        user = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'Toff Hr Only', 'login': 'toff_hr_only', 'tz': fx.TZ,
            'group_ids': [(6, 0, (
                self.env.ref('base.group_user') | self.env.ref('hr.group_hr_user')).ids)]})
        self.env.flush_all()
        self.env.invalidate_all()
        # the read must not raise; without a right on the allocations and the requests the user
        # gets no line (the lines the rights allow, and these are none)
        card = self.env['hr.employee.public'].with_user(user).browse(self.anita.id).read(FIELDS)[0]
        # an empty Json value reads back as False
        self.assertFalse(card['avatar_leave_summary'])
        self.assertEqual(card['avatar_hours_per_week'], 40)

    def test_a17_hours_and_country(self):
        hours = fx.make_hours_type(self.env)
        fx.make_leave(self.env, self.peer, hours, date(2026, 11, 18), duration='specific',
                      hours=(9, 13))
        # a type of another country than the company's is left out, whatever was taken
        country = self.env['res.country'].search(
            [('id', '!=', self.peer.company_id.country_id.id)], limit=1)
        foreign = self.env['hr.work.entry.type'].create({
            'name': 'Toff Foreign', 'code': 'TOFF.F', 'display_code': 'TF', 'color': 2,
            'count_as': 'absence', 'country_id': country.id, 'request_unit': 'day',
            'unit_of_measure': 'day', 'requires_allocation': False,
            'leave_validation_type': 'hr'})
        fx.make_leave(self.env, self.peer, foreign, date(2026, 11, 19))
        lines = {line['name']: line for line in self.card(self.peer)['avatar_leave_summary']}
        self.assertNotIn('Toff Foreign', lines)
        self.assertEqual(
            (lines[fx.HOURS_TYPE]['taken'], lines[fx.HOURS_TYPE]['unit']), (4, 'hours'))
        self.assertFalse(lines[fx.HOURS_TYPE]['requires_allocation'])

    def test_a20_no_summary_for_employee_role(self):
        for login in ('toff_emp', 'toff_none'):
            card = self.card(self.anita, login)
            # an empty Json value reads as False
            self.assertFalse(card['avatar_leave_summary'])
            self.assertEqual(card['avatar_hours_per_week'], 40)

    def test_a16_hours_per_week_as_stored(self):
        self.assertEqual(self.card(self.anita)['avatar_hours_per_week'], 40)
        flexible = self.env['resource.calendar'].create({
            'name': 'Toff Flex 37', 'calendar_type': 'undefined',
            'hours_per_week': 37.5, 'hours_per_day': 7.5})
        self.peer.resource_calendar_id = flexible
        self.assertEqual(self.card(self.peer)['avatar_hours_per_week'], 37.5)
        flexible.hours_per_week = 0
        self.assertEqual(self.card(self.peer)['avatar_hours_per_week'], 0)

    def test_a18_schedule_button_dashboard(self):
        officer = self.users['toff_officer']
        for scale, xmlid in DASHBOARDS.items():
            action = self.anita.with_user(officer).action_time_off_dashboard(scale=scale)
            self.assertEqual(action['views'][0], [self.env.ref(xmlid).id, 'calendar'])
            self.assertEqual(action['domain'], [('employee_id', 'in', self.anita.ids)])
            self.assertEqual(action['context']['default_employee_id'], self.anita.id)
        # no known scale: the year's view
        action = self.anita.with_user(officer).action_time_off_dashboard(scale='quarter')
        self.assertEqual(action['views'][0][0], self.env.ref(DASHBOARDS['year']).id)
        # the public record answers only for the user's own employee
        own = self.env['hr.employee.public'].with_user(officer).browse(officer.employee_id.id)
        self.assertEqual(
            own.action_time_off_dashboard(scale='week')['views'][0][0],
            self.env.ref(DASHBOARDS['week']).id)
        other = self.env['hr.employee.public'].with_user(officer).browse(self.anita.id)
        self.assertFalse(other.action_time_off_dashboard(scale='week'))

    def test_a18_dashboard_for_any_user(self):
        for login in ('toff_emp', 'toff_officer', 'toff_none'):
            public = self.env['hr.employee.public'].with_user(self.users[login]).browse(
                self.anita.id)
            for scale, xmlid in DASHBOARDS.items():
                action = public.hhg_open_leave_dashboard(scale=scale)
                self.assertEqual(action['views'][0], [self.env.ref(xmlid).id, 'calendar'])
                self.assertEqual(action['domain'], [('employee_id', 'in', self.anita.ids)])
            self.assertEqual(
                public.hhg_open_leave_dashboard()['views'][0][0],
                self.env.ref(DASHBOARDS['year']).id)

    def test_a19_new_employee_record(self):
        officer = self.users['toff_officer']
        version = self.anita.with_user(officer).create_version({'date_version': '2026-12-01'})
        self.assertEqual(version.date_version, date(2026, 12, 1))
        self.assertEqual(version.employee_id, self.anita)
        # the Employee role cannot write the employee: the call is refused
        with self.assertRaises(AccessError):
            self.anita.with_user(self.users['toff_emp']).create_version(
                {'date_version': '2026-12-02'})

    def test_card_status_reads_the_package_instant(self):
        employee = self.env['hr.employee'].create({'name': 'Toff Clock Probe'})
        pin = datetime(2026, 11, 11, 10, 0, 5)
        now = fields.Datetime.now()
        if abs(now - pin) < timedelta(hours=2):
            self.skipTest("the real now is within two hours of the pinned instant")
        today = fields.Date.context_today(employee)
        leave = fx.make_leave(self.env, employee, fx.find_type(self.env, 'STO'), today)
        # a window around the real now that never holds the pinned instant
        start, end = now - timedelta(hours=1), now + timedelta(hours=1)
        leave.with_context(leave_skip_state_check=True).sudo().write(
            {'date_from': start, 'date_to': end})
        self.assertFalse(start <= pin <= end)
        self.env.flush_all()
        self.env.invalidate_all()
        self.assertTrue(employee.leave_date_to, "the leave in progress is read at the real now")
        fx.pin_leave_status_clock(self)
        self.env.invalidate_all()
        self.assertFalse(employee.leave_date_to)
        public = self.env['hr.employee.public'].browse(employee.id)
        self.assertFalse(public.read(['leave_date_to'])[0]['leave_date_to'])
