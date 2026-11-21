# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import date

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
        # Mitchell Admin: 10 days of the compensatory type, 3 taken; the sick type has no
        # allocation and 3 days taken; the line with the smaller time left comes first
        lines = self.card(self.mitchell)['avatar_leave_summary']
        sick_name = fx.find_type(self.env, 'STO').name
        compensatory_name = fx.find_type(self.env, 'CTO').name
        ours = [line for line in lines if line['name'] in (compensatory_name, sick_name)]
        self.assertEqual([line['name'] for line in ours], [sick_name, compensatory_name])
        sick, compensatory = ours
        self.assertFalse(sick['requires_allocation'])
        self.assertEqual((sick['taken'], sick['unit']), (3, 'days'))
        # the demo data may already allocate this type to him: left is what is allocated less 3
        allocated = sum(self.env['hr.leave.allocation'].search([
            ('employee_id', '=', self.mitchell.id), ('state', '=', 'validate'),
            ('work_entry_type_id', '=', fx.find_type(self.env, 'CTO').id),
        ]).mapped('number_of_days'))
        self.assertEqual(compensatory['taken'], 3)
        self.assertEqual(compensatory['left'], allocated - 3)
        self.assertTrue(compensatory['requires_allocation'])
        lefts = [line['left'] for line in lines]
        self.assertEqual(lefts, sorted(lefts))

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

    def test_a19_new_employee_record(self):
        officer = self.users['toff_officer']
        version = self.anita.with_user(officer).create_version({'date_version': '2026-12-01'})
        self.assertEqual(version.date_version, date(2026, 12, 1))
        self.assertEqual(version.employee_id, self.anita)
        # the Employee role cannot write the employee: the call is refused
        with self.assertRaises(AccessError):
            self.anita.with_user(self.users['toff_emp']).create_version(
                {'date_version': '2026-12-02'})
