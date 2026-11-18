# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from unittest.mock import patch

from odoo.exceptions import UserError
from odoo.fields import Domain
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

SPEC = {'employee_id': {'fields': {'display_name': {}}}, 'date': {}}
NAME_FILTER = [('employee_id.name', 'ilike', 'HRG ')]


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
            domain if domain is not None else NAME_FILTER, list(groupby), SPEC, **kwargs)

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
        # a negated mix is dropped as a whole, not half-negated
        mixed = NAME_FILTER + [
            '!', '&', ('date', '=', '2026-11-03'), ('employee_id.name', '=', 'HRG A')]
        self.assertEqual(len(self._call(mixed)['groups']), 3)

    def test_r9_or_mixing_employee_leaf_and_dropped_leaf_keeps_every_employee(self):
        domain = NAME_FILTER + [
            '|', ('employee_id', '=', self.emp_b.id), ('date', '=', '2026-11-03')]
        result = self._call(domain)
        self.assertEqual(
            self._rows(result), [('HRG A', [self.loc_2.id]), ('HRG B', []), ('HRG C', [])])
        self.assertEqual(result['length'], 3)

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
            NAME_FILTER, ['employee_id'], SPEC)
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
            NAME_FILTER, ['employee_id'], SPEC)
        # the leaf on the day is not about employees: it opens no row
        self.assertEqual([name for name, _ids in self._rows(result)], ['HRG A'])
        self.assertEqual(result['length'], 1)

    def test_r22_employee_of_another_company_gets_no_row(self):
        user = self._officer('hrg_company')
        other = self.env['res.company'].create({'name': 'HRG Other Company'})
        outsider = self.env['hr.employee'].create({'name': 'HRG D', 'company_id': other.id})
        self.assertNotIn(other, user.company_ids)
        result = self.Location.with_user(user)._get_gantt_data_with_empty(
            NAME_FILTER, ['employee_id'], SPEC)
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
