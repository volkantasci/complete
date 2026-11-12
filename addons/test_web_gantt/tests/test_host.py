# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import json
from datetime import datetime

from odoo.tests.common import TransactionCase


class TestHost(TransactionCase):
    def test_host_builder_creates_setup(self):
        Pill = self.env['test.web.gantt.pill']
        before = Pill.search_count([])
        built = Pill._tl_build_host_records(today='2026-11-12', tz_offset_hours=3)
        # 3 parents + 14 setup records + 4 mixed-type records
        self.assertEqual(Pill.search_count([]) - before, 21)
        self.assertEqual(self.env['test.web.gantt.pill2'].search_count(
            [('id', 'in', [built[n].id for n in ('Day one', 'Three days', 'Next month')])]), 3)
        self.assertEqual(built['Build'].date_start, datetime(2026, 11, 12, 6, 0))
        self.assertEqual(built['Build'].date_stop, datetime(2026, 11, 14, 15, 0))
        self.assertLess(built['Wrong order'].date_stop, built['Wrong order'].date_start)
        self.assertFalse(built['Unscheduled'].date_start)
        self.assertFalse(built['Unscheduled'].date_stop)
        self.assertEqual(built['Build'].x_tags, built['T1'] | built['T2'])
        self.assertEqual(built['Build'].x_contact, built['C1'])
        self.assertTrue(built['Test'].x_flagged)
        self.assertTrue(built['Deploy'].x_done)
        self.assertEqual(built['Design'].parent_id, built['Alpha'])
        self.assertEqual(built['C1'].name, 'Host Contact 1')
        self.assertTrue(built['C1'].image_128)
        self.assertEqual(built['Next month'].date_start.isoformat(), '2026-12-07')

    def test_mix_records(self):
        built = self.env['test.web.gantt.pill']._tl_build_host_records(
            today='2026-11-12', tz_offset_hours=3)
        # the week range of Thursday 12 November 2026 runs from 1 to 21 November
        for name, day in (
            ('MIX first', '2026-11-01'), ('MIX last', '2026-11-21'),
            ('MIX before', '2026-10-31'), ('MIX after', '2026-11-22'),
        ):
            record = built[name]
            self.assertEqual(record.x_day.isoformat(), day)
            self.assertEqual(record.date_start, datetime.fromisoformat(f'{day}T10:00:00'))
            self.assertEqual(record.date_stop, datetime.fromisoformat(f'{day}T12:00:00'))
            self.assertFalse(record.parent_id or record.x_contact)
        self.assertEqual(self.env['test.web.gantt.pill']._fields['x_day'].type, 'date')

    def test_host_mixed_views(self):
        for number, start, stop in ((14, 'x_day', 'date_stop'), (15, 'date_start', 'x_day')):
            view = self.env.ref(f'test_web_gantt.host_view_h{number}')
            action = self.env.ref(f'test_web_gantt.host_action_h{number}')
            self.assertEqual(action.view_id, view)
            self.assertEqual(action.domain, "[('name', '=like', 'MIX%')]")
            self.assertIn(f'date_start="{start}"', view.arch_db)
            self.assertIn(f'date_stop="{stop}"', view.arch_db)
            self.assertTrue(self.env.ref(f'test_web_gantt.host_menu_h{number}'))
            result = self.env[view.model].get_views([(view.id, 'gantt')])
            self.assertEqual(result['views']['gantt']['id'], view.id)

    def test_host_search_view(self):
        search_view = self.env.ref('test_web_gantt.host_view_h13')
        self.assertEqual(search_view.model, 'test.web.gantt.pill')
        self.assertEqual(search_view.type, 'search')
        self.assertIn('string="Archived"', search_view.arch_db)
        self.assertIn("('active', '=', False)", search_view.arch_db)
        for name in ('Parent', 'Contact', 'Tags'):
            self.assertIn(f'string="{name}"', search_view.arch_db)
        # the search view of every host action on the first model
        for number in (*range(1, 10), 11, 12, 14, 15):
            action = self.env.ref(f'test_web_gantt.host_action_h{number}')
            self.assertEqual(action.search_view_id, search_view, f'H{number}')

    def test_archived_filter_reaches_archived_records(self):
        Pill = self.env['test.web.gantt.pill']
        built = Pill._tl_build_host_records(today='2026-11-12', tz_offset_hours=3)
        built['Overlap C'].active = False
        domain = [('id', '=', built['Overlap C'].id)]
        self.assertFalse(Pill.search(domain))
        self.assertEqual(Pill.search([('active', '=', False)] + domain), built['Overlap C'])

    def test_host_views_load(self):
        for number in (*range(1, 13), 14, 15):
            view = self.env.ref(f'test_web_gantt.host_view_h{number}')
            action = self.env.ref(f'test_web_gantt.host_action_h{number}')
            self.assertEqual(action.view_id, view)
            result = self.env[view.model].get_views([(view.id, 'gantt')])
            self.assertEqual(result['views']['gantt']['id'], view.id)
        self.assertTrue(self.env.ref('test_web_gantt.host_menu_root'))
        self.assertEqual(
            self.env.ref('test_web_gantt.host_action_h2').context, "{'group_by': ['parent_id']}")
        self.assertEqual(
            self.env.ref('test_web_gantt.host_action_h12').context, "{'group_by': ['x_contact']}")

    def test_demo_install_has_host_records(self):
        if not self.env['ir.module.module'].search_count(
                [('name', '=', 'test_web_gantt'), ('demo', '=', True)]):
            self.skipTest('database without demo data')
        for name in ('Build', 'Wrong order', 'Unscheduled', 'Alpha'):
            self.assertTrue(self.env['test.web.gantt.pill'].search_count([('name', '=', name)]))
        self.assertTrue(self.env['test.web.gantt.pill2'].search_count([('name', '=', 'Day one')]))
        self.assertTrue(self.env['res.partner'].search_count([('name', '=', 'Host Contact 1')]))

    def test_hook_override_answers(self):
        Pill = self.env['test.web.gantt.pill']
        args = ('x_contact', [1, 2], None, None, 'week')
        self.assertEqual(Pill._gantt_unavailability(*args), {})
        self.assertEqual(Pill._gantt_progress_bar('x_contact', [1], None, None), {})
        window = [{'start': '2026-11-12 06:00:00', 'stop': '2026-11-12 15:00:00'}]
        self.env['ir.config_parameter'].set_str('test_web_gantt.hook_answers', json.dumps({
            'unavailability': {'x_contact': {'1': window, '9': window}},
            'progress': {'x_contact': {'1': {'value': 3, 'max_value': 8}}},
        }))
        self.assertEqual(Pill._gantt_unavailability(*args), {'1': window})
        self.assertEqual(
            Pill._gantt_progress_bar('x_contact', [1], None, None),
            {'1': {'value': 3, 'max_value': 8}})
        self.assertEqual(Pill._gantt_progress_bar('parent_id', [1], None, None), {})
