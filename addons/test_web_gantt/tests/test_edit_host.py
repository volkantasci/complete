# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import ast
import uuid

from lxml import etree
from odoo import Command
from odoo.tests.common import TransactionCase

PILL = 'test.web.gantt.pill'
XML = 'test_web_gantt.'
EDIT_VIEWS = {
    'host_view_h17': {'plan': '0', 'form_view_id': None},
    'host_view_h18': {'plan': '0'},
    'host_view_h19': {'edit': '0'},
    'host_view_h20': {'create': '0'},
    'host_view_h21': {'delete': '0', 'plan': '0'},
    'host_view_h22': {'on_create': 'test_web_gantt.host_quick_create'},
    'host_view_h23': {'cell_create': '0', 'plan': '0'},
    'host_view_h24': {'decoration-info': 'x_done'},
}


class TestEditHost(TransactionCase):
    def _arch(self, xmlid, view_type='gantt', user=None, model=PILL):
        view = self.env.ref(XML + xmlid)
        env_model = self.env[model]
        if user:
            env_model = env_model.with_user(user)
        views = env_model.get_views([(view.id, view_type)])['views']
        return etree.fromstring(views[view_type]['arch'])

    def _restricted_user(self):
        login = f'restricted_{uuid.uuid4().hex[:8]}'
        return self.env['res.users'].create({
            'name': 'Restricted editor',
            'login': login,
            'group_ids': [Command.set([self.env.ref('base.group_user').id])],
        })

    def test_002b_host_views_load(self):
        for xmlid, attrs in EDIT_VIEWS.items():
            arch = self._arch(xmlid)
            self.assertEqual(arch.tag, 'gantt', xmlid)
            self.assertEqual(arch.get('color'), 'x_color', xmlid)
            self.assertEqual(arch.get('default_range'), 'week', xmlid)
            for key, value in attrs.items():
                if value is None:
                    self.assertTrue(arch.get(key), f'{xmlid} {key}')
                else:
                    self.assertEqual(arch.get(key), value, f'{xmlid} {key}')
        self.assertEqual(
            int(self._arch('host_view_h17').get('form_view_id')),
            self.env.ref(XML + 'host_view_short_form').id)
        for xmlid in ('host_view_h19', 'host_view_h24'):
            arch = self._arch(xmlid)
            self.assertTrue(arch.xpath('.//popover'), xmlid)
            self.assertTrue(
                arch.xpath('.//field[@name="x_done"][@widget="boolean_toggle"]'), xmlid)
        buttons = self._arch('host_view_h24').xpath('.//button[@name="action_archive"]')
        self.assertEqual(len(buttons), 1)
        self.assertEqual(buttons[0].get('type'), 'object')
        h25 = self._arch('host_view_h25', model='test.web.gantt.pill2')
        self.assertEqual(h25.get('plan'), '0')
        self.assertIsNone(h25.get('precision'))
        self.assertEqual(h25.get('scales'), 'day,week,month')
        # forms and lists
        form = self._arch('host_view_h16_form', 'form')
        self.assertEqual(
            [f.get('name') for f in form.iter('field')],
            ['name', 'parent_id', 'x_contact', 'x_tags', 'date_start', 'date_stop',
             'x_color', 'x_progress'])
        lst = self._arch('host_view_h16_list', 'list')
        self.assertEqual(
            [f.get('name') for f in lst.iter('field')],
            ['name', 'parent_id', 'date_start', 'date_stop'])
        short = self._arch('host_view_short_form', 'form')
        self.assertEqual(
            [f.get('name') for f in short.iter('field')], ['name', 'date_start', 'date_stop'])
        # the default form of the model is H16's; the short form has a higher priority number
        self.assertEqual(self.env.ref(XML + 'host_view_h16_form').priority, 1)
        self.assertEqual(self.env.ref(XML + 'host_view_short_form').priority, 50)
        default_form = self.env[PILL].get_views([(False, 'form')])['views']['form']
        self.assertEqual(default_form['id'], self.env.ref(XML + 'host_view_h16_form').id)
        # actions and menus
        for number in range(17, 28):
            action = self.env.ref(f'{XML}host_action_h{number}')
            self.assertEqual(action.view_mode, 'gantt,list,form')
        for number in range(16, 28):
            self.assertTrue(self.env.ref(f'{XML}host_menu_h{number}'))
        quick = self.env.ref(XML + 'host_quick_create')
        self.assertEqual((quick.res_model, quick.target), (PILL, 'new'))
        self.assertEqual(quick.name, 'Host quick create')

    def test_002b_a1_loader_switches_permissions(self):
        user = self._restricted_user()
        arch = self._arch('host_view_h1', user=user)
        for key in ('create', 'edit', 'delete'):
            self.assertEqual(arch.get(key), 'False', key)
        arch = self._arch('host_view_h1')
        for key in ('create', 'edit', 'delete'):
            self.assertIsNone(arch.get(key), key)
        for who in (None, user):
            self.assertEqual(self._arch('host_view_h21', user=who).get('delete'), '0')
        view = self.env['ir.ui.view'].create({
            'name': 'delete one',
            'model': PILL,
            'type': 'gantt',
            'arch': '<gantt date_start="date_start" date_stop="date_stop" delete="1"/>',
        })
        views = self.env[PILL].with_user(user).get_views([(view.id, 'gantt')])['views']
        self.assertEqual(etree.fromstring(views['gantt']['arch']).get('delete'), '1')

    def test_002b_h26_default_parent(self):
        built = self.env[PILL]._tl_build_host_records(today='2026-11-12', tz_offset_hours=3)
        context = ast.literal_eval(self.env.ref(XML + 'host_action_h26').context)
        self.assertEqual(context['group_by'], ['parent_id'])
        self.assertEqual(context['default_parent_id'], built['Gamma'].id)
        self.assertEqual(
            ast.literal_eval(self.env.ref(XML + 'host_action_h27').context),
            {'group_by': ['x_tags']})

    def test_002b_search_parent_field(self):
        arch = self._arch('host_view_h13', 'search')
        self.assertTrue(arch.xpath('//field[@name="parent_id"]'))

    def test_002b_access_internal_read_only(self):
        user = self._restricted_user()
        Pill = self.env[PILL].with_user(user)
        self.assertTrue(Pill.has_access('read'))
        for operation in ('write', 'create', 'unlink'):
            self.assertFalse(Pill.has_access(operation), operation)
        for operation in ('read', 'write', 'create', 'unlink'):
            self.assertTrue(self.env[PILL].has_access(operation), operation)
        self.assertTrue(self.env['test.web.gantt.pill2'].with_user(user).has_access('create'))
