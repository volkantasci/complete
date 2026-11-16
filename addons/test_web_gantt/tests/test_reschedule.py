# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import uuid

from odoo import Command
from odoo.exceptions import AccessError, UserError
from odoo.tests.common import TransactionCase, freeze_time

PILL = 'test.web.gantt.pill'
KEEP = 'maintainBuffer'
USE = 'consumeBuffer'
LOOP_TEXT = 'These dependencies form a loop, so nothing was moved'
PAST_TEXT = 'Could not move Chain B: it would start in the past'


class TestReschedule(TransactionCase):
    """Server rescheduling along the dependencies (002c R17 to R21, E3 to E6)."""

    def setUp(self):
        super().setUp()
        self.Pill = self.env[PILL]
        self._rebuild()

    # helpers
    def _rebuild(self):
        self.rec = self.Pill._tl_build_reschedule_records()
        self.a, self.b, self.c = (self.rec[name] for name in ('Chain A', 'Chain B', 'Chain C'))

    def _call(self, record, values, method=KEEP, user=None, dependency='dependency_field'):
        model = self.Pill.with_user(user) if user else self.Pill
        return model.web_gantt_reschedule(
            values, method, [record.id], dependency, 'dependency_inverted_field',
            'date_start', 'date_stop')

    def _dates(self, record):
        record.invalidate_recordset()
        return tuple(str(value) if value else False
                     for value in (record.date_start, record.date_stop))

    def _assert_dates(self, record, start, stop):
        self.assertEqual(self._dates(record), (f'2030-{start}:00', f'2030-{stop}:00'),
                         record.name)

    def _assert_prepared(self, *names):
        prepared = {
            'Chain A': ('06-10 06:00', '06-10 14:00'),
            'Chain B': ('06-11 06:00', '06-11 14:00'),
            'Chain C': ('06-12 06:00', '06-13 14:00'),
        }
        for name in names:
            self._assert_dates(self.rec[name], *prepared[name])

    def _move(self, start, stop):
        return {'date_start': f'2030-{start}:00', 'date_stop': f'2030-{stop}:00'}

    def _new(self, name, start, stop, **extra):
        return self.Pill.create({
            'name': name, 'date_start': f'2030-{start}:00', 'date_stop': f'2030-{stop}:00',
            **extra})

    # scenarios
    def test_a51_keep_buffer_forward_backward(self):
        answer = self._call(self.a, self._move('06-11 06:00', '06-11 14:00'))
        self.assertEqual(answer['type'], 'success')
        self._assert_dates(self.b, '06-12 06:00', '06-12 14:00')
        self._assert_dates(self.c, '06-13 06:00', '06-14 14:00')
        self.assertEqual(
            set(answer['old_vals_per_pill_id']), {self.a.id, self.b.id, self.c.id})
        self.assertEqual(answer['old_vals_per_pill_id'][self.b.id], {
            'date_start': '2030-06-11 06:00:00', 'date_stop': '2030-06-11 14:00:00'})

        self._rebuild()
        self._call(self.c, self._move('06-11 06:00', '06-12 14:00'))
        self._assert_dates(self.b, '06-10 06:00', '06-10 14:00')
        self._assert_dates(self.a, '06-09 06:00', '06-09 14:00')

        self._rebuild()
        answer = self._call(self.b, self._move('06-10 10:00', '06-10 18:00'))
        self._assert_dates(self.a, '06-09 10:00', '06-09 18:00')
        self._assert_prepared('Chain C')
        self.assertEqual(set(answer['old_vals_per_pill_id']), {self.a.id, self.b.id})
        self.assertEqual(answer['old_vals_per_pill_id'][self.b.id], {
            'date_start': '2030-06-11 06:00:00', 'date_stop': '2030-06-11 14:00:00'})

    def test_a52_use_buffer(self):
        self._call(self.a, self._move('06-11 06:00', '06-11 14:00'), USE)
        self._assert_dates(self.b, '06-11 14:00', '06-11 22:00')
        self._assert_prepared('Chain C')

        self._rebuild()
        self._call(self.c, self._move('06-11 06:00', '06-12 14:00'), USE)
        self._assert_dates(self.b, '06-10 22:00', '06-11 06:00')
        self._assert_prepared('Chain A')

        self._rebuild()
        self._call(self.b, self._move('06-10 10:00', '06-10 18:00'), USE)
        self._assert_dates(self.a, '06-10 02:00', '06-10 10:00')

    def test_a53_only_stop(self):
        for method, later in ((KEEP, False), (USE, False), (KEEP, True), (USE, True)):
            self._rebuild()
            stop = '2030-06-11 10:00:00' if later else '2030-06-10 10:00:00'
            answer = self._call(self.a, {'date_stop': stop}, method)
            self.assertEqual(answer['old_vals_per_pill_id'][self.a.id], {
                'date_stop': '2030-06-10 14:00:00', 'date_start': '2030-06-10 06:00:00'})
            if (method, later) == (KEEP, False):
                self._assert_dates(self.b, '06-11 02:00', '06-11 10:00')
                self._assert_dates(self.c, '06-12 02:00', '06-13 10:00')
            elif (method, later) == (USE, False):
                self._assert_prepared('Chain B', 'Chain C')
                self.assertEqual(set(answer['old_vals_per_pill_id']), {self.a.id})
            elif (method, later) == (KEEP, True):
                self._assert_dates(self.b, '06-12 02:00', '06-12 10:00')
                self._assert_dates(self.c, '06-13 02:00', '06-14 10:00')
            else:
                self._assert_dates(self.b, '06-11 10:00', '06-11 18:00')
                self._assert_prepared('Chain C')

    def test_a54_plain_writes(self):
        answer = self._call(self.a, {'name': 'Renamed'})
        self.assertEqual(answer['type'], 'success')
        self.assertEqual(answer['old_vals_per_pill_id'], {self.a.id: {'name': 'Chain A'}})
        self.assertEqual(self.a.name, 'Renamed')
        self._assert_prepared('Chain B', 'Chain C')
        # a start without stop
        self._call(self.a, {'date_start': '2030-06-11 06:00:00'})
        self.assertEqual(str(self.a.date_start), '2030-06-11 06:00:00')
        self._assert_prepared('Chain B', 'Chain C')
        # no dependency field name
        self._call(self.a, self._move('06-12 06:00', '06-12 14:00'), dependency='')
        self._assert_dates(self.a, '06-12 06:00', '06-12 14:00')
        self._assert_prepared('Chain B', 'Chain C')
        # a start before the server's time
        answer = self._call(self.a, {
            'date_start': '2026-01-01 06:00:00', 'date_stop': '2026-01-01 14:00:00'})
        self.assertEqual(answer['type'], 'success')
        self.assertEqual(str(self.a.date_start), '2026-01-01 06:00:00')
        self._assert_prepared('Chain B', 'Chain C')

    def test_a89_resize_end_of_a_record_started_in_the_past(self):
        p = self._new('P', '06-10 14:00', '06-10 14:00')
        p.date_start = '2026-01-01 06:00:00'
        p.date_stop = '2030-06-10 14:00:00'
        f = self._new('F', '06-11 06:00', '06-11 14:00', dependency_field=[Command.set(p.ids)])
        answer = self._call(p, {'date_stop': '2030-06-11 10:00:00'}, KEEP)
        self.assertEqual(answer['type'], 'success')
        self.assertEqual(self._dates(p), ('2026-01-01 06:00:00', '2030-06-11 10:00:00'))
        self._assert_dates(f, '06-12 02:00', '06-12 10:00')
        self.assertEqual(answer['old_vals_per_pill_id'], {
            p.id: {'date_stop': '2030-06-10 14:00:00', 'date_start': '2026-01-01 06:00:00'},
            f.id: {'date_start': '2030-06-11 06:00:00', 'date_stop': '2030-06-11 14:00:00'},
        })

    def test_a55_past_candidate_stops_search(self):
        x = self._new('X', '07-01 06:00', '07-01 14:00')
        y = self.Pill.create({
            'name': 'Y', 'date_start': '2026-01-01 06:00:00', 'date_stop': '2026-01-01 14:00:00',
            'dependency_field': [Command.set(x.ids)]})
        z = self._new('Z', '07-03 06:00', '07-03 14:00', dependency_field=[Command.set(y.ids)])
        answer = self._call(x, self._move('07-02 06:00', '07-02 14:00'))
        self.assertEqual(answer['type'], 'success')
        self.assertEqual(set(answer['old_vals_per_pill_id']), {x.id})
        self.assertEqual(str(y.date_start), '2026-01-01 06:00:00')
        self._assert_dates(z, '07-03 06:00', '07-03 14:00')

    def test_a56_past_error(self):
        with freeze_time('2030-06-11 00:00:00'):
            answer = self._call(self.c, self._move('06-11 06:00', '06-12 14:00'))
        self.assertEqual(answer, {
            'type': 'warning', 'message': PAST_TEXT, 'old_vals_per_pill_id': {}})
        self._assert_prepared('Chain A', 'Chain B', 'Chain C')

    def test_a57_cycle(self):
        loop1, loop2 = self.rec['Loop 1'], self.rec['Loop 2']
        answer = self._call(loop1, self._move('06-14 18:00', '06-14 22:00'))
        self.assertEqual(answer, {
            'type': 'warning', 'message': LOOP_TEXT, 'old_vals_per_pill_id': {}})
        self.assertEqual(self._dates(loop1), ('2030-06-14 06:00:00', '2030-06-14 10:00:00'))
        self.assertEqual(self._dates(loop2), ('2030-06-14 11:00:00', '2030-06-14 14:00:00'))

    def test_a58_unknown_method(self):
        with self.assertRaises(UserError) as caught:
            self._call(self.a, self._move('06-11 06:00', '06-11 14:00'), 'manual')
        self.assertIn('manual', str(caught.exception))
        self._assert_prepared('Chain A', 'Chain B', 'Chain C')

    def test_a59_several_blockers(self):
        # D follows B with 30 h of free time and is also blocked by E, which is not moved
        for stop_of_e, expected in (
            ('06-14 02:00', '06-14 02:00'),   # E's stop is the latest
            ('06-13 10:00', '06-13 20:00'),   # B's new stop plus the old free time
        ):
            self._rebuild()
            e = self._new('E', '06-13 00:00', stop_of_e)
            d = self._new('D', '06-12 20:00', '06-13 04:00',
                          dependency_field=[Command.set([self.b.id, e.id])])
            self._call(self.a, self._move('06-11 06:00', '06-11 14:00'))
            self.assertEqual(str(d.date_start), f'2030-{expected}:00', stop_of_e)
            self.assertEqual(str(d.date_stop - d.date_start), '8:00:00')
            e.unlink()
            d.unlink()
        # use buffer: D is in conflict with E's stop; its start is the latest bound, no gap
        self._rebuild()
        e = self._new('E', '06-11 00:00', '06-12 20:00')
        d = self._new('D', '06-12 06:00', '06-12 14:00',
                      dependency_field=[Command.set([self.b.id, e.id])])
        self._call(self.a, self._move('06-11 06:00', '06-11 14:00'), USE)
        self._assert_dates(self.b, '06-11 14:00', '06-11 22:00')
        self.assertEqual(str(d.date_start), '2030-06-12 20:00:00')

    def test_a59b_blocker_without_dates(self):
        e = self.Pill.create({'name': 'E no dates'})
        d = self._new('D', '06-12 20:00', '06-13 04:00',
                      dependency_field=[Command.set([self.b.id, e.id])])
        self._call(self.a, self._move('06-11 06:00', '06-11 14:00'))
        self.assertEqual(str(d.date_start), '2030-06-13 20:00:00')

    def test_a60_blocked_without_dates(self):
        self.b.write({'date_start': False, 'date_stop': False})
        answer = self._call(self.a, self._move('06-11 06:00', '06-11 14:00'))
        self.assertEqual(answer['type'], 'success')
        self.assertEqual(set(answer['old_vals_per_pill_id']), {self.a.id})
        self._assert_dates(self.a, '06-11 06:00', '06-11 14:00')
        self._assert_dates(self.c, '06-12 06:00', '06-13 14:00')
        self.assertFalse(self.b.date_start)

    def test_a61_rollback(self):
        answer = self._call(self.a, self._move('06-11 06:00', '06-11 14:00'))
        listed = {str(key): value for key, value in answer['old_vals_per_pill_id'].items()}
        loop = self.rec['Loop 1']
        listed[str(loop.id)] = {}
        self.Pill.browse(self.a.id).action_rollback_scheduling(listed)
        self._assert_prepared('Chain A', 'Chain B', 'Chain C')
        self.assertEqual(self._dates(loop), ('2030-06-14 06:00:00', '2030-06-14 10:00:00'))

    def test_a62_property_values(self):
        parent = self.Pill.create({
            'name': 'Props parent',
            'pill_properties_definition': [
                {'name': 'p1', 'type': 'char', 'string': 'One'},
                {'name': 'p2', 'type': 'char', 'string': 'Two'}],
        })
        child = self._new('Props child', '07-01 06:00', '07-01 14:00', parent_id=parent.id,
                          pill_properties={'p1': 'a', 'p2': 'b'})
        values = {**self._move('07-02 06:00', '07-02 14:00'), 'pill_properties.p1': 'new'}
        answer = self._call(child, values)
        self.assertEqual(answer['type'], 'success')
        child.invalidate_recordset()
        self.assertEqual(child.pill_properties['p1'], 'new')
        self.assertEqual(child.pill_properties['p2'], 'b')
        old = answer['old_vals_per_pill_id'][child.id]
        self.assertEqual({item['name']: item['value'] for item in old['pill_properties']},
                         {'p1': 'a', 'p2': 'b'})
        self.assertNotIn('pill_properties.p1', old)
        self.Pill.browse(child.id).action_rollback_scheduling(
            {str(key): value for key, value in answer['old_vals_per_pill_id'].items()})
        child.invalidate_recordset()
        self.assertEqual((child.pill_properties['p1'], child.pill_properties['p2']), ('a', 'b'))
        self._assert_dates(child, '07-01 06:00', '07-01 14:00')

    def test_a63_access(self):
        user = self.env['res.users'].create({
            'name': 'Restricted editor', 'login': f'restricted_{uuid.uuid4().hex[:8]}',
            'group_ids': [Command.set(self.env.ref('base.group_user').ids)],
        })
        with self.assertRaises(AccessError):
            self._call(self.a, self._move('06-11 06:00', '06-11 14:00'), user=user)
        self._assert_prepared('Chain A', 'Chain B', 'Chain C')

    def test_a63_read_without_write_right(self):
        user = self.env['res.users'].create({
            'name': 'Reader', 'login': f'reader_{uuid.uuid4().hex[:8]}',
            'group_ids': [Command.set(self.env.ref('base.group_user').ids)],
        })
        pills = self.Pill.with_user(user)
        self.assertTrue(pills.has_access('read'))
        self.assertFalse(pills.has_access('write'))
        # the read goes through, the call stops at the write; nothing changed, Chain A included
        self.assertEqual(pills.browse(self.a.id).name, 'Chain A')
        for method in (KEEP, USE):
            with self.assertRaises(AccessError):
                self._call(self.a, self._move('06-11 06:00', '06-11 14:00'), method, user=user)
            with self.assertRaises(AccessError):
                self._call(self.a, {'name': 'Plain'}, method, user=user)
        self.assertEqual(self.a.name, 'Chain A')
        self._assert_prepared('Chain A', 'Chain B', 'Chain C')

    def test_e5_records_without_both_dates_plain_write(self):
        # no stored start, a start given; no new stop with only the stop given
        self.a.write({'date_start': False})
        answer = self._call(self.a, self._move('06-11 06:00', '06-11 14:00'))
        self.assertEqual(answer['type'], 'success')
        self._assert_dates(self.a, '06-11 06:00', '06-11 14:00')
        self._assert_prepared('Chain B', 'Chain C')
        answer = self._call(self.a, {'date_start': '2030-06-12 06:00:00'})
        self.assertEqual(answer['type'], 'success')
        self._assert_prepared('Chain B', 'Chain C')
        self._rebuild()
        answer = self._call(self.a, {'date_stop': False})
        self.assertEqual(answer['type'], 'success')
        self.assertFalse(self.a.date_stop)
        self._assert_prepared('Chain B', 'Chain C')
        # a stored stop missing, both dates given
        self._rebuild()
        self.a.write({'date_stop': False})
        answer = self._call(self.a, self._move('06-11 06:00', '06-11 14:00'))
        self.assertEqual(answer['type'], 'success')
        self._assert_prepared('Chain B', 'Chain C')

    def test_t11_1_only_stop_earlier_keeps_the_shifted_stop(self):
        # Chain C starts later than Chain B's shifted stop and is not among the candidates
        values = {'date_stop': '2030-06-10 10:00:00'}   # 4 h earlier
        errors, warnings, old = self.a._web_gantt_move_candidates(
            self.b, values, KEEP, 'backward', 'dependency_field',
            'dependency_inverted_field', 'date_start', 'date_stop')
        self.assertEqual((errors, warnings), ([], []))
        self.assertEqual(set(old), {self.a.id, self.b.id})
        # the bound given by C (12 June 06:00) must not lengthen B: its stop is the shifted stop
        self._assert_dates(self.b, '06-11 02:00', '06-11 10:00')
        self._assert_prepared('Chain C')

    def test_a67_buffers_ignored(self):
        self.b.write({'x_buffer_before': 5, 'x_buffer_after': 7})
        self._call(self.a, self._move('06-11 06:00', '06-11 14:00'))
        self._assert_dates(self.b, '06-12 06:00', '06-12 14:00')
        self._assert_dates(self.c, '06-13 06:00', '06-14 14:00')

    def test_a79_backward_bound_by_non_candidate(self):
        # F is blocked by Chain B but the backward search does not reach it
        f = self._new('F', '06-11 15:00', '06-11 18:00',
                      dependency_field=[Command.set(self.b.ids)])
        answer = self._call(self.c, self._move('06-11 06:00', '06-12 14:00'))
        self._assert_dates(self.b, '06-10 06:00', '06-10 14:00')   # C's start minus 16 h
        self._assert_dates(f, '06-11 15:00', '06-11 18:00')
        self.assertEqual(set(answer['old_vals_per_pill_id']), {self.a.id, self.b.id, self.c.id})
        # F starting before that bound is the bound
        self._rebuild()
        self._new('F2', '06-10 12:00', '06-10 18:00', dependency_field=[Command.set(self.b.ids)])
        self._call(self.c, self._move('06-11 06:00', '06-12 14:00'))
        self._assert_dates(self.b, '06-10 04:00', '06-10 12:00')
        self._assert_dates(self.a, '06-09 04:00', '06-09 12:00')

    def test_a80_use_buffer_no_conflict(self):
        answer = self._call(self.a, {'date_stop': '2030-06-11 10:00:00'}, USE)
        self._assert_dates(self.b, '06-11 10:00', '06-11 18:00')
        self._assert_prepared('Chain C')
        self.assertEqual(set(answer['old_vals_per_pill_id']), {self.a.id, self.b.id})

    def test_a72_messages(self):
        self.assertEqual(self._call(self.a, {})['message'], 'Records rescheduled')
        loop = self._call(self.rec['Loop 1'], self._move('06-14 18:00', '06-14 22:00'))
        self.assertEqual(loop['message'], LOOP_TEXT)
        with freeze_time('2030-06-11 00:00:00'):
            past = self._call(self.c, self._move('06-11 06:00', '06-12 14:00'))
        self.assertEqual(past['message'], PAST_TEXT)


class TestRescheduleDates(TransactionCase):
    """Rescheduling of date-only records in whole days (002c R26, decisions D3, D4)."""

    def setUp(self):
        super().setUp()
        admin = self.env.ref('base.user_admin')
        admin.tz = 'Europe/Paris'
        self.Dated = self.env['test.web.gantt.pill2'].with_user(admin)
        self._rebuild()

    def _rebuild(self):
        rec = self.env['test.web.gantt.pill']._tl_build_reschedule_records()
        self.a, self.b = rec['dated Chain A'], rec['dated Chain B']

    def _call(self, record, values, method=KEEP):
        return self.Dated.web_gantt_reschedule(
            values, method, [record.id], 'dependency_field', 'dependency_inverted_field',
            'date_start', 'date_stop')

    def _days(self, record):
        record.invalidate_recordset()
        return (str(record.date_start), str(record.date_stop))

    def _assert_days(self, record, start, stop=None):
        self.assertEqual(self._days(record), (f'2030-06-{start}', f'2030-06-{stop or start}'),
                         record.name)

    def test_a81_dates_forward(self):
        answer = self._call(self.a, {'date_start': '2030-06-12', 'date_stop': '2030-06-12'})
        self.assertEqual(answer['type'], 'success')
        self._assert_days(self.a, '12')
        self._assert_days(self.b, '14')
        self.assertEqual(answer['old_vals_per_pill_id'], {
            self.a.id: {'date_start': '2030-06-10', 'date_stop': '2030-06-10'},
            self.b.id: {'date_start': '2030-06-12', 'date_stop': '2030-06-12'}})
        self._rebuild()
        answer = self._call(self.a, {'date_start': '2030-06-12', 'date_stop': '2030-06-12'}, USE)
        self.assertEqual(answer['type'], 'success')
        self._assert_days(self.b, '13')
        self.assertEqual(answer['old_vals_per_pill_id'][self.b.id],
                         {'date_start': '2030-06-12', 'date_stop': '2030-06-12'})

    def test_a82_dates_backward(self):
        answer = self._call(self.b, {'date_start': '2030-06-10', 'date_stop': '2030-06-10'})
        self.assertEqual(answer['type'], 'success')
        self._assert_days(self.a, '08')
        self._rebuild()
        self._call(self.b, {'date_start': '2030-06-10', 'date_stop': '2030-06-10'}, USE)
        self._assert_days(self.a, '09')

    def test_a83_dates_resize_end(self):
        answer = self._call(self.a, {'date_stop': '2030-06-11'})
        self.assertEqual(answer['type'], 'success')
        self._assert_days(self.a, '10', '11')
        self._assert_days(self.b, '13')
        self.assertEqual(answer['old_vals_per_pill_id'][self.a.id],
                         {'date_stop': '2030-06-10', 'date_start': '2030-06-10'})
        self._rebuild()
        self._call(self.a, {'date_stop': '2030-06-11'}, USE)
        self._assert_days(self.a, '10', '11')
        self._assert_days(self.b, '12')
        # a candidate of two days keeps two days
        self._rebuild()
        self.b.write({'date_stop': '2030-06-13'})
        self._call(self.a, {'date_stop': '2030-06-11'})
        self._assert_days(self.b, '13', '14')
        self._rebuild()
        self.b.write({'date_stop': '2030-06-13'})
        self._call(self.a, {'date_stop': '2030-06-11'}, USE)
        self._assert_days(self.b, '12', '13')

    def test_a84_dates_past(self):
        # 9 June 2030, 12:00 in Paris (UTC+2)
        with freeze_time('2030-06-09 10:00:00'):
            answer = self._call(self.b, {'date_start': '2030-06-11', 'date_stop': '2030-06-11'})
            self.assertEqual(answer['type'], 'warning')
            self.assertIn('Could not move Chain A', answer['message'])
            self.assertEqual(answer['old_vals_per_pill_id'], {})
            self._assert_days(self.a, '10')
            self._assert_days(self.b, '12')
            answer = self._call(self.a, {'date_start': '2030-06-08', 'date_stop': '2030-06-08'})
            self.assertEqual(answer['type'], 'success')
            self._assert_days(self.a, '08')
            self._assert_days(self.b, '12')
            # today: the start of the day lies before the server's time
            answer = self._call(self.a, {'date_start': '2030-06-09', 'date_stop': '2030-06-09'})
            self.assertEqual(answer['type'], 'success')
            self._assert_days(self.a, '09')
            self._assert_days(self.b, '12')

    def test_a85_dates_use_buffer_conflict(self):
        self._call(self.a, {'date_start': '2030-06-12', 'date_stop': '2030-06-12'}, USE)
        self._assert_days(self.b, '13')
        self._rebuild()
        self._call(self.a, {'date_start': '2030-06-11', 'date_stop': '2030-06-11'}, USE)
        self._assert_days(self.b, '12')
