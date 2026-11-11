# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from lxml import etree
from odoo.addons.web_gantt.models.timeline_base import _TL_STOP_CANDIDATES
from odoo.exceptions import UserError
from odoo.tests.common import TransactionCase


class TestDefaultView(TransactionCase):
    def test_a2_every_field_sent(self):
        view = self.env['ir.ui.view'].create({
            'name': 'Pill gantt narrow',
            'model': 'test.web.gantt.pill',
            'type': 'gantt',
            'arch': '<gantt date_start="date_start" date_stop="date_stop">'
                    '<field name="name"/></gantt>',
        })
        pill = self.env['test.web.gantt.pill']
        result = pill.get_views([(view.id, 'gantt')])
        fields_sent = result['models']['test.web.gantt.pill']['fields']
        for name in ('parent_id', 'pill_properties', 'dependency_field'):
            self.assertIn(name, fields_sent)

    def test_a3_generated_view(self):
        pill = self.env['test.web.gantt.pill']
        arch = etree.fromstring(pill.get_views([(False, 'gantt')])['views']['gantt']['arch'])
        self.assertEqual(arch.tag, 'gantt')
        self.assertEqual(arch.get('string'), 'Test Web Gantt Pill')
        self.assertEqual(arch.get('date_start'), 'date_start')
        self.assertEqual(arch.get('date_stop'), 'date_stop')

    def test_a3_candidate_fields(self):
        model = self.env['ir.model'].create({
            'name': 'Candidate Host', 'model': 'x_tl_candidate', 'state': 'manual',
        })
        for name in ('x_start_date', 'x_date_end'):
            self.env['ir.model.fields'].create({
                'name': name, 'model_id': model.id, 'field_description': name,
                'ttype': 'datetime', 'state': 'manual',
            })
        arch = self.env['x_tl_candidate']._get_default_gantt_view()
        self.assertEqual(arch.get('string'), 'Candidate Host')
        self.assertEqual(arch.get('date_start'), 'x_start_date')
        self.assertEqual(arch.get('date_stop'), 'x_date_end')

    def test_a3_declared_names_win(self):
        pill = self.env['test.web.gantt.pill']
        # both fields exist: the declared start must beat the existing date_start
        self.patch(type(pill), '_start_name', 'date_stop')
        self.patch(type(pill), '_stop_name', 'date_start')
        arch = pill._get_default_gantt_view()
        self.assertEqual(arch.get('date_start'), 'date_stop')
        self.assertEqual(arch.get('date_stop'), 'date_start')

    def test_a3_missing_declared_names_fall_back(self):
        pill = self.env['test.web.gantt.pill']
        self.patch(type(pill), '_start_name', 'x_missing')
        self.assertEqual(pill._get_default_gantt_view().get('date_start'), 'date_start')

    def test_a3_stop_candidate_order(self):
        model = self.env['ir.model'].create({
            'name': 'Order Host', 'model': 'x_tl_order', 'state': 'manual',
        })
        for name in ('x_start_date', 'x_end_date', 'x_date_end'):
            self.env['ir.model.fields'].create({
                'name': name, 'model_id': model.id, 'field_description': name,
                'ttype': 'datetime', 'state': 'manual',
            })
        # x_date_end comes before x_end_date in the candidate list
        arch = self.env['x_tl_order']._get_default_gantt_view()
        self.assertEqual(arch.get('date_stop'), 'x_date_end')

    def test_a3_plain_stop_candidates_in_order(self):
        # date_end beats end_date when both exist (candidate order 3 and 4)
        self.assertLess(
            _TL_STOP_CANDIDATES.index('date_end'), _TL_STOP_CANDIDATES.index('end_date'))
        pill = self.env['test.web.gantt.pill']
        self.patch(type(pill), '_fields', {'end_date': 1, 'date_end': 1})
        self.assertEqual(pill._tl_pick_field('x_none', _TL_STOP_CANDIDATES), 'date_end')

    def test_a4_no_date_fields(self):
        with self.assertRaisesRegex(UserError, 'start and stop'):
            self.env['res.partner.category']._get_default_gantt_view()
        with self.assertRaisesRegex(UserError, 'start and stop'):
            self.env['res.partner.category'].get_views([(False, 'gantt')])
