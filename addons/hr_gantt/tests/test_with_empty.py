# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from unittest.mock import patch

from odoo.exceptions import UserError
from odoo.fields import Domain
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

SPEC = {'employee_id': {'fields': {'display_name': {}}}, 'date': {}}
NAME_FILTER = [('employee_id.name', 'ilike', 'HRG ')]
PERIOD = {'start_date': '2026-11-01 00:00:00', 'stop_date': '2026-11-08 00:00:00'}


@tagged('post_install', '-at_install')
class TestWithEmpty(TransactionCase):
    """The helper on ``hr.employee.location``: a model of ``hr`` alone with an employee field."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        Employee = cls.env['hr.employee']
        cls.emp_a, cls.emp_b, cls.emp_c = (
            Employee.create({'name': f'HRG {letter}'}) for letter in 'ABC')
        place = cls.env['hr.work.location'].create({'name': 'HRG Place'})
        Location = cls.env['hr.employee.location']
        cls.loc_1, cls.loc_2 = (
            Location.create({
                'employee_id': cls.emp_a.id, 'work_location_id': place.id, 'date': day,
            }) for day in ('2026-11-02', '2026-11-03'))
        cls.Location = Location

    def _call(self, domain=None, groupby=('employee_id',), **kwargs):
        return self.Location._get_gantt_data_with_empty(
            domain if domain is not None else NAME_FILTER, list(groupby), SPEC,
            **{**PERIOD, **kwargs})

    def _rows(self, result):
        return [(g['employee_id'][1], g['__record_ids']) for g in result['groups']]

    def test_a24_every_matching_employee_gets_a_group(self):
        result = self._call()
        self.assertEqual(
            self._rows(result),
            [('HRG A', [self.loc_1.id, self.loc_2.id]), ('HRG B', []), ('HRG C', [])])
        self.assertEqual(result['length'], 3)
        self.assertEqual({r['id'] for r in result['records']}, {self.loc_1.id, self.loc_2.id})
        page = self._call(limit=2, offset=2)
        self.assertEqual(self._rows(page), [('HRG C', [])])
        self.assertEqual(page['length'], 3)
        self.assertEqual(page['records'], [])

    def test_a24_hooks_asked_for_empty_rows(self):
        seen = {}

        def unavailability(model, name, ids, start, stop, scale):
            seen['unavailability'] = (name, ids, scale)
            return {i: [] for i in ids}

        def progress(model, name, ids, start, stop):
            seen['progress'] = (name, ids)
            return {i: {} for i in ids}

        cls = type(self.Location)
        with patch.object(cls, '_gantt_unavailability', unavailability), \
                patch.object(cls, '_gantt_progress_bar', progress):
            result = self._call(
                unavailability_fields=['employee_id'], progress_bar_fields=['employee_id'],
                start_date='2026-11-01 00:00:00', stop_date='2026-11-08 00:00:00', scale='week')
        wanted = sorted([self.emp_a.id, self.emp_b.id, self.emp_c.id])
        self.assertEqual(seen['unavailability'], ('employee_id', wanted, 'week'))
        self.assertEqual(seen['progress'], ('employee_id', wanted))
        self.assertEqual(set(result['unavailabilities']['employee_id']), set(wanted))
        self.assertEqual(set(result['progress_bars']['employee_id']), set(wanted))

    def test_a25_refuses_two_fields(self):
        with self.assertRaises(UserError):
            self._call(groupby=('employee_id', 'work_location_id'))

    def test_a25_refuses_non_relation(self):
        with self.assertRaises(UserError):
            self._call(groupby=('date',))

    def test_a25_refuses_no_grouping(self):
        with self.assertRaises(UserError):
            self._call(groupby=())

    def test_a25_refuses_a_call_without_a_period(self):
        for dates in (
            {'start_date': None}, {'stop_date': None}, {'start_date': None, 'stop_date': None},
        ):
            with self.subTest(dates=dates), self.assertRaises(UserError):
                self._call(**dates)
        with self.assertRaises(UserError):
            self.Location._get_gantt_data_with_empty(NAME_FILTER, ['employee_id'], SPEC)

    def test_a25_accepts_relations_to_many_records(self):
        category_a, category_b = self.env['hr.employee.category'].create(
            [{'name': 'HRG Tag 1'}, {'name': 'HRG Tag 2'}])
        (category_a | category_b).employee_ids = self.emp_b
        category_a.employee_ids |= self.emp_a
        Category = self.env['hr.employee.category']
        result = Category._get_gantt_data_with_empty(
            [('name', 'ilike', 'HRG Tag')], ['employee_ids'], {'name': {}}, **PERIOD)
        rows = {g['employee_ids'][1]: sorted(g['__record_ids']) for g in result['groups']}
        self.assertEqual(rows['HRG A'], [category_a.id])
        self.assertEqual(rows['HRG B'], sorted([category_a.id, category_b.id]))
        self.assertEqual(rows['HRG C'], [])
        self.assertEqual(result['length'], len(result['groups']))

    def test_r9_condition_through_relation_kept(self):
        result = self._call([('employee_id.name', 'ilike', 'HRG A')])
        self.assertEqual([name for name, _ids in self._rows(result)], ['HRG A'])
        self.assertEqual(result['length'], 1)
        result = self._call([('employee_id', 'in', [self.emp_b.id, self.emp_c.id])])
        self.assertEqual([name for name, _ids in self._rows(result)], ['HRG B', 'HRG C'])

    def test_r9_other_condition_dropped(self):
        domain = NAME_FILTER + [('date', '=', '2026-11-03')]
        result = self._call(domain)
        self.assertEqual(
            self._rows(result), [('HRG A', [self.loc_2.id]), ('HRG B', []), ('HRG C', [])])
        self.assertEqual(result['length'], 3)

    def test_r9_negated_attendance_leaf_is_not_inverted(self):
        domain = NAME_FILTER + ['!', ('date', '=', '2026-11-03')]
        result = self._call(domain)
        self.assertEqual(
            self._rows(result), [('HRG A', [self.loc_1.id]), ('HRG B', []), ('HRG C', [])])
        # a negated leaf on the employee keeps its meaning
        result = self._call(NAME_FILTER + ['!', ('employee_id.name', 'ilike', 'HRG B')])
        self.assertEqual([n for n, _ids in self._rows(result)], ['HRG A', 'HRG C'])
        # a negated mix: the negation moves down to the conditions (A66)
        mixed = NAME_FILTER + [
            '!', '&', ('date', '=', '2026-11-03'), ('employee_id.name', '=', 'HRG A')]
        self.assertEqual([n for n, _ids in self._rows(self._call(mixed))], ['HRG B', 'HRG C'])

    def test_a66_a_dropped_condition_is_false_inside_an_or(self):
        domain = NAME_FILTER + [
            '|', ('employee_id', '=', self.emp_b.id), ('date', '=', '2026-11-03')]
        result = self._call(domain)
        self.assertEqual(self._rows(result), [('HRG B', [])])
        self.assertEqual(result['length'], 1)

    def test_a66_a_dropped_condition_is_true_inside_an_and(self):
        domain = NAME_FILTER + [
            '&', ('employee_id', '=', self.emp_b.id), ('date', '=', '2026-11-03')]
        self.assertEqual([n for n, _ids in self._rows(self._call(domain))], ['HRG B'])

    def test_a66_negations_move_down_to_the_conditions(self):
        a_name = ('employee_id.name', 'ilike', 'HRG A')
        a_day = ('date', '=', '2026-11-03')
        # not (A and day) = not A or not day: the dropped part is false in an "or"
        names = [n for n, _ids in self._rows(self._call(NAME_FILTER + ['!', '&', a_name, a_day]))]
        self.assertEqual(names, ['HRG B', 'HRG C'])
        # not (A or day) = not A and not day: the dropped part is true in an "and"
        names = [n for n, _ids in self._rows(self._call(NAME_FILTER + ['!', '|', a_name, a_day]))]
        self.assertEqual(names, ['HRG B', 'HRG C'])
        # A or day: the dropped part is false
        names = [n for n, _ids in self._rows(self._call(NAME_FILTER + ['|', a_name, a_day]))]
        self.assertEqual(names, ['HRG A'])
        # a double negation changes nothing
        names = [n for n, _ids in self._rows(self._call(NAME_FILTER + ['!', '!', a_name]))]
        self.assertEqual(names, ['HRG A'])

    def test_a66_a_field_reached_through_the_relation(self):
        department = self.env['hr.department'].create({'name': 'HRG Research'})
        (self.emp_a | self.emp_c).department_id = department
        result = self._call(NAME_FILTER + [('employee_id.department_id.name', 'ilike', 'Research')])
        self.assertEqual([n for n, _ids in self._rows(result)], ['HRG A', 'HRG C'])

    def test_a66_an_operator_with_nothing_to_convert_says_nothing(self):
        """The period of the browser is such an operator: it must not empty the rows.

        A54 and M68 need it: the future week of 13 to 19 December shows twenty rows.
        """
        only_attendance = ['|', ('date', '<', '2026-01-01'), ('date', '>', '2026-12-31')]
        result = self._call(NAME_FILTER + only_attendance)
        self.assertEqual(len(result['groups']), 3)
        only_and = [
            '|', ('employee_id', '=', self.emp_b.id),
            '&', ('date', '=', '2026-11-02'), ('id', '>', 0)]
        self.assertEqual(len(self._call(NAME_FILTER + only_and)['groups']), 1)

    def test_r9_offset_past_the_end_gives_no_group_and_the_true_length(self):
        result = self._call(limit=20, offset=20)
        self.assertEqual(result['groups'], [])
        self.assertEqual(result['records'], [])
        self.assertEqual(result['length'], 3)

    def test_r9_related_field_repeating_employee_field(self):
        # ``employee_name`` is the model's related field ``employee_id.name``
        result = self._call([('employee_name', 'ilike', 'HRG B')])
        self.assertEqual(self._rows(result), [('HRG B', [])])

    def test_r9_archived_employees_only_when_asked(self):
        self.emp_c.active = False
        self.assertEqual(len(self._call()['groups']), 2)
        archived = self._call(NAME_FILTER + [('employee_id.active', '=', False)])
        self.assertEqual([n for n, _ids in self._rows(archived)], ['HRG C'])

    def test_r9_read_rule_becomes_employee_condition(self):
        user = self.env['res.users'].create({
            'name': 'HRG Officer', 'login': 'hrg_officer',
            'group_ids': [(6, 0, [
                self.env.ref('base.group_user').id, self.env.ref('hr.group_hr_user').id])],
        })
        self.env['ir.access'].create({
            'name': 'HRG: only employee A',
            'model_id': self.env['ir.model']._get_id('hr.employee.location'),
            'operation': 'r',
            'domain': f"[('employee_id', '=', {self.emp_a.id})]",
        })
        result = self.Location.with_user(user)._get_gantt_data_with_empty(
            NAME_FILTER, ['employee_id'], SPEC, **PERIOD)
        self.assertEqual([name for name, _ids in self._rows(result)], ['HRG A'])
        self.assertEqual(result['length'], 1)

    def _officer(self, login):
        officer_groups = self.env.ref('base.group_user') | self.env.ref('hr.group_hr_user')
        values = {'name': f'HRG {login}', 'login': login, 'group_ids': [(6, 0, officer_groups.ids)]}
        return self.env['res.users'].create(values)

    def test_r22_read_rule_leaf_outside_the_relation_cannot_widen_rows(self):
        user = self._officer('hrg_rule_or')
        self.env['ir.access'].create({
            'name': 'HRG: employee A or a day',
            'model_id': self.env['ir.model']._get_id('hr.employee.location'),
            'operation': 'r',
            'domain': f"['|', ('employee_id', '=', {self.emp_a.id}), ('date', '=', '2026-11-03')]",
        })
        result = self.Location.with_user(user)._get_gantt_data_with_empty(
            NAME_FILTER, ['employee_id'], SPEC, **PERIOD)
        # the leaf on the day is not about employees: it opens no row
        self.assertEqual([name for name, _ids in self._rows(result)], ['HRG A'])
        self.assertEqual(result['length'], 1)

    def test_r22_a_user_without_hr_rights_gets_the_own_row(self):
        # the Community's own rule on this model keeps a plain user to their employee; the
        # employees are searched with the user's own rights (through the public employee)
        user = self.env['res.users'].create({
            'name': 'HRG Plain', 'login': 'hrg_plain',
            'group_ids': [(6, 0, [self.env.ref('base.group_user').id])],
        })
        self.emp_b.user_id = user
        self.env.flush_all()
        result = self.Location.with_user(user)._get_gantt_data_with_empty(
            [], ['employee_id'], SPEC, **PERIOD)
        self.assertEqual([name for name, _ids in self._rows(result)], ['HRG B'])
        self.assertEqual(result['length'], 1)

    def test_r22_employee_of_another_company_gets_no_row(self):
        user = self._officer('hrg_company')
        other = self.env['res.company'].create({'name': 'HRG Other Company'})
        outsider = self.env['hr.employee'].create({'name': 'HRG D', 'company_id': other.id})
        self.assertNotIn(other, user.company_ids)
        result = self.Location.with_user(user)._get_gantt_data_with_empty(
            NAME_FILTER, ['employee_id'], SPEC, **PERIOD)
        names = [name for name, _ids in self._rows(result)]
        self.assertEqual(names, ['HRG A', 'HRG B', 'HRG C'])
        self.assertNotIn(outsider.id, [g['employee_id'][0] for g in result['groups']])
        self.assertEqual(result['length'], 3)

    def test_r14_concerns_only_classification(self):
        concerns = self.Location._hrg_concerns_only
        self.assertTrue(concerns([], 'employee_id'))
        self.assertTrue(concerns([('employee_id.department_id', '=', 1)], 'employee_id'))
        self.assertTrue(
            concerns([('employee_name', '=', 'x'), ('employee_id', '=', 1)], 'employee_id'))
        self.assertFalse(concerns([('date', '=', '2026-11-02')], 'employee_id'))
        self.assertFalse(concerns(
            ['|', ('employee_id', '=', 1), ('date', '=', '2026-11-02')], 'employee_id'))
        self.assertFalse(concerns(['!', ('date', '=', '2026-11-02')], 'employee_id'))

    def test_r9_related_domain_shape(self):
        convert = self.Location._hrg_related_domain
        self.assertEqual(convert([('employee_id', '=', 5)], 'employee_id'), [('id', '=', 5)])
        self.assertEqual(
            convert([('employee_id.name', '=', 'x')], 'employee_id'), [('name', '=', 'x')])
        self.assertTrue(Domain(convert([('date', '=', '2026-11-02')], 'employee_id')).is_true())
