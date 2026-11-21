# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Notes on 002d2 (002d3 N1 to N3): A69 and A70 on the server, A71 in a tour."""
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from .hr_rows_fixtures import HrRowsCase, _datetime, move_others_away, utc
from .test_hr_rows_tours import HrToursBase

FUTURE_WEEK = ('2026-12-12 23:00', '2026-12-19 23:00', '2026-11-11 10:00')  # 13 to 19 December
DAY = ('2026-11-10 23:00', '2026-11-11 23:00', '2026-11-11 10:00')  # Wednesday 11 November
DAY_9 = (utc('2026-11-08 23:00'), utc('2026-11-09 23:00'))  # Monday 9 November, Brussels
WEEK_8 = (utc('2026-11-07 23:00'), utc('2026-11-14 23:00'))  # Sunday 8 to Saturday 14
# the days of a change of daylight-saving time (Europe/Brussels), 25 h and 23 h long
DAY_25_OCT = (utc('2026-10-24 22:00'), utc('2026-10-25 23:00'))
DAY_29_MAR = (utc('2026-03-28 23:00'), utc('2026-03-29 22:00'))


@tagged('post_install', '-at_install')
class TestNotes002d2(HrRowsCase, TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.make_world()
        move_others_away(cls.env, keep_prefix='Notes ')
        # their own employees: CI installs no demo data. Marc has an open attendance on the day,
        # Anna a closed one of four hours.
        cls.notes = {}
        for name in ('Notes Marc', 'Notes Anna', 'Notes Bob', 'Notes Cy'):
            cls.notes[name] = cls.env['hr.employee'].create({
                'name': name, 'tz': 'Europe/Brussels', 'resource_calendar_id': cls.schedule.id})
        attendance = cls.env['hr.attendance'].with_context(skip_time_rules=True)
        attendance.create({
            'employee_id': cls.notes['Notes Marc'].id,
            'check_in': _datetime('2026-11-11 07:00:00'), 'check_out': None})
        attendance.create({
            'employee_id': cls.notes['Notes Anna'].id,
            'check_in': _datetime('2026-11-11 07:00:00'),
            'check_out': _datetime('2026-11-11 11:00:00')})
        cls.env.flush_all()

    def names_for(self, period, search):
        result = self.get_data(*period, user_domain=search, limit=200)
        return [name for name in self.row_names(result) if name.startswith('Notes ')]

    def test_a69_search_to_employees(self):
        # no search: the future week keeps every employee (its period concerns no employee)
        self.assertEqual(self.names_for(FUTURE_WEEK, []), sorted(self.notes))
        marc = ('employee_id.name', 'ilike', 'Marc')
        open_long = ['&', ('check_out', '=', False), ('worked_hours', '>=', 16)]
        either = ['|', ('check_out', '=', False), ('worked_hours', '>=', 16)]
        # "Marc or (no check-out and worked hours of 16 or more)": Marc alone
        self.assertEqual(self.names_for(DAY, ['|', marc, *open_long]), ['Notes Marc'])
        # "Marc and (no check-out or worked hours of 16 or more)": Marc alone
        self.assertEqual(self.names_for(DAY, ['&', marc, *either]), ['Notes Marc'])
        # the conversion itself (N1): the inner operators that lose every condition disappear
        # from the "or" and from the "and"; they do not make the whole search false
        for search in (['|', marc, *open_long], ['&', marc, *either]):
            converted = self.Attendance._hrg_related_domain(search, 'employee_id')
            self.assertEqual(converted, [('name', 'ilike', 'Marc')], search)
        # an "or" that loses all its conditions disappears from its "and", and "and" from the top
        period = ['|', ('check_in', '<', '2026-01-01'), ('check_out', '>', '2026-12-31')]
        always_true = [(1, '=', 1)]
        self.assertEqual(self.Attendance._hrg_related_domain(period, 'employee_id'), always_true)
        self.assertEqual(
            self.Attendance._hrg_related_domain(['&', *period, marc], 'employee_id'),
            [('name', 'ilike', 'Marc')])

    def test_a70_fully_flexible_max(self):
        free = self.prepared['Gantt Free']
        self.env['hr.attendance'].search([('employee_id', '=', free.id)]).unlink()
        model = self.Attendance.with_context(tz='Europe/Brussels')

        def entry(period):
            return model._gantt_progress_bar('employee_id', [free.id], *period)[free.id]

        day = entry(DAY_9)
        self.assertEqual((day['value'], day['max_value'], day['hag_fully_flexible']), (0, 24, True))
        self.assertEqual(entry(WEEK_8)['max_value'], 168)
        # an attendance of the whole day: 24 h, ratio 100
        self.env['hr.attendance'].with_context(skip_time_rules=True).create({
            'employee_id': free.id, 'check_in': DAY_9[0], 'check_out': DAY_9[1]})
        self.env.flush_all()
        day = entry(DAY_9)
        self.assertEqual((day['value'], day['max_value']), (24, 24))

    def test_a70_days_of_a_change_of_time(self):
        """N2's table: the days are the calendar days of the period, 24 h each, also on the day of
        25 h and the day of 23 h; a whole-day attendance counts its own length (25 h, 23 h), whose
        ratio gives the label's colour (the Hoot test of the labels: 104 % warning, 96 % muted)."""
        free = self.prepared['Gantt Free']
        self.env['hr.attendance'].search([('employee_id', '=', free.id)]).unlink()
        model = self.Attendance.with_context(tz='Europe/Brussels')
        for period, length in ((DAY_25_OCT, 25), (DAY_29_MAR, 23)):
            with self.subTest(day=period[0], length=length):
                self.assertEqual((period[1] - period[0]).total_seconds() / 3600, length)
                empty = model._gantt_progress_bar('employee_id', [free.id], *period)[free.id]
                self.assertEqual((empty['value'], empty['max_value']), (0, 24))
                attendance = self.env['hr.attendance'].with_context(skip_time_rules=True).create({
                    'employee_id': free.id, 'check_in': period[0], 'check_out': period[1]})
                self.env.flush_all()
                whole = model._gantt_progress_bar('employee_id', [free.id], *period)[free.id]
                self.assertEqual((whole['value'], whole['max_value']), (length, 24))
                self.assertTrue(whole['hag_fully_flexible'])
                attendance.with_context(skip_time_rules=True).unlink()


@tagged('post_install', '-at_install')
class TestNotesTours(HrToursBase):

    def test_a71_tooltip_name(self):
        """A71 (N3): the demo-like world on the Day range; the tour is in actions_tours.js."""
        self._demo()
        self._tour('hr_actions_a71_tooltip_name')
