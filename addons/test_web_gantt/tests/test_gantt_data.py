# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime
from unittest.mock import patch

from odoo.tests.common import TransactionCase

SPEC = {'display_name': {}}


class TestGanttData(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Pill = cls.env['test.web.gantt.pill']
        cls.tag1, cls.tag2, cls.tag3 = cls.Pill.create(
            [{'name': f'Tag {index}'} for index in (1, 2, 3)])
        cls.parent_a, cls.parent_b, cls.empty_parent = cls.Pill.create(
            [{'name': 'Parent A'}, {'name': 'Parent B'}, {'name': 'Parent C'}])
        links = [
            ('R1', cls.tag1, cls.parent_a),
            ('R2', cls.tag1 | cls.tag2, cls.parent_a),
            ('R3', cls.tag2 | cls.tag3, cls.parent_b),
            ('R4', cls.tag1 | cls.tag2 | cls.tag3, cls.parent_b),
            ('R5', cls.Pill, cls.parent_a),
            ('R6', cls.Pill, cls.parent_b),
        ]
        cls.records = cls.Pill
        for name, tags, parent in links:
            cls.records |= cls.Pill.create({
                'name': name, 'dependency_field': [(6, 0, tags.ids)], 'parent_id': parent.id,
            })
        cls.domain = [('id', 'in', cls.records.ids)]

    def _call(self, groupby=(), **kwargs):
        return self.Pill.get_gantt_data(
            kwargs.pop('domain', self.domain), list(groupby), SPEC, **kwargs)

    def test_a12_ungrouped_data(self):
        result = self._call()
        self.assertEqual(result['groups'], [{'__record_ids': self.records.ids}])
        self.assertEqual(len(result['records']), 6)
        self.assertEqual(result['length'], 1)
        self.assertEqual(result['unavailabilities'], {})
        self.assertEqual(result['progress_bars'], {})

    def test_a13_many2many_groups(self):
        result = self._call(['dependency_field'])
        by_key = {}
        for group in result['groups']:
            value = group['dependency_field']
            by_key[value[1] if value else False] = group['__record_ids']
        r1, r2, r3, r4, r5, r6 = self.records.ids
        self.assertEqual(by_key['Tag 1'], [r1, r2, r4])
        self.assertEqual(by_key['Tag 2'], [r2, r3, r4])
        self.assertEqual(by_key['Tag 3'], [r3, r4])
        self.assertEqual(by_key[False], [r5, r6])
        self.assertIn(
            (self.tag1.id, 'Tag 1'),
            [tuple(group['dependency_field']) for group in result['groups']
             if group['dependency_field']])
        self.assertEqual(result['length'], len(result['groups']))
        for group in result['groups']:
            self.assertNotIn('__extra_domain', group)
            self.assertNotIn('__fold', group)

    def test_a14_limit_offset(self):
        full = self._call(['dependency_field'])
        page = self._call(['dependency_field'], limit=2, offset=1)
        self.assertEqual(page['groups'], full['groups'][1:3])
        self.assertEqual(len(page['groups']), 2)
        self.assertEqual(page['length'], full['length'])
        both = ['parent_id', 'dependency_field']
        everything = self._call(both)
        paged = self._call(both, limit=2)
        self.assertEqual(len(paged['groups']), 2)
        for group in paged['groups']:
            self.assertIn('parent_id', group)
            self.assertIn('dependency_field', group)
        self.assertEqual(paged['length'], len(everything['groups']))
        self.assertGreater(paged['length'], 2)

    def test_a15_archived_listed(self):
        archived = self.records[:2]
        archived.write({'active': False})
        result = self.Pill.with_context(active_test=False).get_gantt_data(
            self.domain, ['dependency_field'], SPEC)
        listed = {rid for group in result['groups'] for rid in group['__record_ids']}
        self.assertTrue(set(archived.ids) <= listed)
        self.assertTrue(set(archived.ids) <= {rec['id'] for rec in result['records']})

    def test_a16_two_levels(self):
        result = self._call(['parent_id', 'dependency_field'])
        r1, r2, r3, r4, r5, r6 = self.records.ids
        found = {}
        for group in result['groups']:
            parent = group['parent_id']
            tag = group['dependency_field']
            found[(parent[1], tag[1] if tag else False)] = group['__record_ids']
        self.assertEqual(found[('Parent A', 'Tag 1')], [r1, r2])
        self.assertEqual(found[('Parent A', 'Tag 2')], [r2])
        self.assertEqual(found[('Parent A', False)], [r5])
        self.assertEqual(found[('Parent B', 'Tag 2')], [r3, r4])
        self.assertEqual(found[('Parent B', False)], [r6])

    def test_a17_hooks_called(self):
        pill_class = type(self.Pill)
        answer_u = {'1': [{'start': 'a', 'stop': 'b'}]}
        answer_p = {'1': {'value': 1, 'max_value': 2}}
        with patch.object(pill_class, '_gantt_unavailability', return_value=answer_u) as unav, \
                patch.object(pill_class, '_gantt_progress_bar', return_value=answer_p) as prog:
            result = self._call(
                ['parent_id'], unavailability_fields=['parent_id'],
                progress_bar_fields=['parent_id'],
                start_date='2026-10-31 21:00:00', stop_date='2026-11-21 21:00:00',
                scale='week')
        parents = sorted([self.parent_a.id, self.parent_b.id])
        start, stop = datetime(2026, 10, 31, 21), datetime(2026, 11, 21, 21)
        unav.assert_called_once_with('parent_id', parents, start, stop, 'week')
        prog.assert_called_once_with('parent_id', parents, start, stop)
        self.assertEqual(result['unavailabilities'], {'parent_id': answer_u})
        self.assertEqual(result['progress_bars'], {'parent_id': answer_p})

    def test_a18_base_hooks_empty(self):
        partner = self.env['res.partner']
        self.assertEqual(partner._gantt_unavailability('x', [1], None, None, 'week'), {})
        self.assertEqual(partner._gantt_progress_bar('x', [1], None, None), {})
        self.assertEqual(self.Pill._gantt_unavailability('x', [1], None, None, 'week'), {})
        self.assertEqual(self.Pill._gantt_progress_bar('x', [1], None, None), {})

    def test_a102_expanded_empty_group(self):
        every_parent = self.parent_a | self.parent_b | self.empty_parent

        def expand(records, values, domain):
            return every_parent

        self.patch(self.Pill._fields['parent_id'], 'group_expand', expand)
        result = self._call(['parent_id'])
        by_name = {g['parent_id'][1]: g['__record_ids'] for g in result['groups']}
        self.assertEqual(by_name['Parent C'], [])
        self.assertEqual(len(by_name['Parent A']), 3)
