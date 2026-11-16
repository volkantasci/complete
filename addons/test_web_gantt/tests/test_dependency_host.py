# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import uuid
from ast import literal_eval

from lxml import etree
from odoo import Command
from odoo.tests.common import TransactionCase

PILL = 'test.web.gantt.pill'
PILL2 = 'test.web.gantt.pill2'
XML = 'test_web_gantt.'
DEP = {
    'dependency_field': 'dependency_field',
    'dependency_inverted_field': 'dependency_inverted_field',
}
VIEWS = {
    'host_view_h42': (PILL, {'edit': None, 'color': 'x_color'}),
    'host_view_h44': (PILL, {'buffer_start': 'x_buffer_before', 'buffer_stop': 'x_buffer_after'}),
    'host_view_h45': (PILL2, {'string': 'Dated pills', 'default_range': 'week'}),
    'host_view_h48': (PILL, {'multi_create_view': XML + 'host_form_template_one'}),
    'host_view_h49': (PILL, {'edit': '0'}),
    'host_view_h50': (PILL, {'sample': '1', 'string': 'Pills'}),
    'host_view_h54': (PILL, {'edit': '1'}),
}
CONTEXTS = {
    'h42': {'group_by': ['parent_id']},
    'h43': {'group_by': ['x_tags']},
    'h44': {'group_by': ['parent_id']},
    'h45': {},
    'h46': {'initialDate': '2030-06-12 06:00:00'},
    'h47': {'initialDate': '2030-06-12 06:00:00'},
    'h48': {'group_by': ['parent_id']},
    'h49': {'group_by': ['parent_id']},
    'h50': {},
    'h54': {'group_by': ['parent_id']},
}


class TestDependencyHost(TransactionCase):
    def _arch(self, xmlid, model=PILL, user=None):
        view = self.env.ref(XML + xmlid)
        records = self.env[model].with_user(user) if user else self.env[model]
        views = records.get_views([(view.id, 'gantt')])['views']
        return etree.fromstring(views['gantt']['arch'])

    def _names(self, records):
        return {record.name for record in records}

    def test_002c_host_views_load(self):
        for xmlid, (model, attrs) in VIEWS.items():
            arch = self._arch(xmlid, model)
            self.assertEqual(arch.tag, 'gantt', xmlid)
            for key, value in DEP.items():
                self.assertEqual(arch.get(key), value, f'{xmlid} {key}')
            for key, value in attrs.items():
                self.assertEqual(arch.get(key), value, f'{xmlid} {key}')

    def test_002c_host_actions(self):
        for key, context in CONTEXTS.items():
            action = self.env.ref(XML + f'host_action_{key}')
            self.assertEqual(literal_eval(action.context), context, key)
            self.assertEqual(action.view_mode, 'gantt,list,form', key)
            self.assertTrue(self.env.ref(XML + f'host_menu_{key}'), key)
        ref = self.env.ref
        self.assertEqual(ref(XML + 'host_action_h43').view_id, ref(XML + 'host_view_h42'))
        self.assertEqual(ref(XML + 'host_action_h46').view_id, ref(XML + 'host_view_h42'))
        self.assertEqual(ref(XML + 'host_action_h47').view_id, ref(XML + 'host_view_h45'))
        self.assertEqual(ref(XML + 'host_action_h47').res_model, PILL2)
        h50, h8 = ref(XML + 'host_action_h50'), ref(XML + 'host_action_h8')
        self.assertEqual(h50.domain, h8.domain)
        self.assertEqual(h50.help, h8.help)

    def test_002c_buffer_fields(self):
        labels = (('x_buffer_before', 'Buffer before'), ('x_buffer_after', 'Buffer after'))
        for name, label in labels:
            field = self.env[PILL]._fields[name]
            self.assertEqual((field.type, field.string), ('float', label))

    def _check_links(self, built):
        links = {
            name: self._names(built[name].dependency_field)
            for name in ('Design', 'Build', 'Test', 'Review', 'Overlap A', 'Plan', 'Deploy')
        }
        self.assertEqual(links, {
            'Design': set(), 'Build': {'Design'}, 'Test': {'Build'}, 'Review': set(),
            'Overlap A': {'Review'}, 'Plan': set(), 'Deploy': set()})
        self.assertEqual(self._names(built['Design'].dependency_inverted_field), {'Build'})
        self.assertEqual(self._names(built['Day one'].dependency_field), {'Three days'})
        self.assertFalse(built['Three days'].dependency_field)
        self.assertFalse(built['Next month'].dependency_field)
        buffers = {
            record.name: (record.x_buffer_before, record.x_buffer_after)
            for record in self.env[PILL].search([('name', '!=', False)])
            if record.x_buffer_before or record.x_buffer_after}
        self.assertEqual(buffers, {'Design': (24, 12), 'Review': (12, 24)})

    def test_002c_links_and_buffers_survive_rebuild(self):
        built = self.env[PILL]._tl_build_host_records(today='2026-11-12')
        self._check_links(built)
        ids = {name: record.id for name, record in built.items()}
        # drift away from the table, then rebuild: ids and links are restored
        built['Test'].dependency_field = [Command.clear()]
        built['Plan'].dependency_field = [Command.set(built['Design'].ids)]
        built['Plan'].x_buffer_after = 5
        again = self.env[PILL]._tl_build_host_records(today='2026-11-14')
        self.assertEqual({name: record.id for name, record in again.items()}, ids)
        self._check_links(again)

    def test_002c_reschedule_records(self):
        Pill = self.env[PILL]
        Pill._tl_build_reschedule_records()
        built = Pill._tl_build_reschedule_records()  # a second call leaves no duplicate
        chain = ('Chain A', 'Chain B', 'Chain C', 'Loop 1', 'Loop 2')
        self.assertEqual(self.env[PILL].search_count([('name', 'in', list(chain))]), 5)
        self.assertEqual(self.env[PILL2].search_count([('name', 'in', ['Chain A', 'Chain B'])]), 2)
        self.assertEqual(
            [(built[n].date_start.isoformat(sep=' '), built[n].date_stop.isoformat(sep=' '),
              built[n].x_color) for n in chain],
            [('2030-06-10 06:00:00', '2030-06-10 14:00:00', 1),
             ('2030-06-11 06:00:00', '2030-06-11 14:00:00', 2),
             ('2030-06-12 06:00:00', '2030-06-13 14:00:00', 3),
             ('2030-06-14 06:00:00', '2030-06-14 10:00:00', 4),
             ('2030-06-14 11:00:00', '2030-06-14 14:00:00', 5)])
        self.assertEqual(
            {n: self._names(built[n].dependency_field) for n in chain},
            {'Chain A': set(), 'Chain B': {'Chain A'}, 'Chain C': {'Chain B'},
             'Loop 1': {'Loop 2'}, 'Loop 2': {'Loop 1'}})
        for name in chain:
            self.assertEqual(built[name].create_uid, self.env.ref('base.user_admin'))
        dated_a, dated_b = built['dated Chain A'], built['dated Chain B']
        self.assertEqual(
            (str(dated_a.date_start), str(dated_a.date_stop)), ('2030-06-10', '2030-06-10'))
        self.assertEqual(
            (str(dated_b.date_start), str(dated_b.date_stop)), ('2030-06-12', '2030-06-12'))
        self.assertEqual(dated_b.dependency_field, dated_a)
        Pill._tl_drop_reschedule_records()
        self.assertFalse(self.env[PILL].with_context(active_test=False).search(
            [('name', 'in', list(chain))]))
        self.assertFalse(self.env[PILL2].with_context(active_test=False).search(
            [('name', 'in', ['Chain A', 'Chain B'])]))

    def test_002c_restricted_user_edit(self):
        user = self.env['res.users'].create({
            'name': 'Restricted editor',
            'login': f'restricted_{uuid.uuid4().hex[:8]}',
            'group_ids': [Command.set(self.env.ref('base.group_user').ids)],
        })
        self.assertEqual(self._arch('host_view_h42', user=user).get('edit'), 'False')
        self.assertEqual(self._arch('host_view_h54', user=user).get('edit'), '1')
        self.assertIsNone(self._arch('host_view_h42').get('edit'))
