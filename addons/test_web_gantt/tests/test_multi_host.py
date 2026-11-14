# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import ast

from lxml import etree
from odoo.tests.common import TransactionCase, tagged

PILL = 'test.web.gantt.pill'
PILL2 = 'test.web.gantt.pill2'
XML = 'test_web_gantt.'
BASE = {
    'string': 'Pills', 'date_start': 'date_start', 'date_stop': 'date_stop',
    'default_range': 'week', 'color': 'x_color',
}
TEMPLATE_ONE = XML + 'host_form_template_one'
TEMPLATE_TWO = XML + 'host_form_template_two'


@tagged('post_install', '-at_install')
class TestTimelineMultiHost(TransactionCase):
    def _arch(self, xmlid, model=PILL):
        view = self.env.ref(XML + xmlid)
        views = self.env[model].get_views([(view.id, 'gantt')])['views']
        return etree.fromstring(views['gantt']['arch'])

    def _context(self, number):
        return ast.literal_eval(self.env.ref(f'{XML}host_action_h{number}').context)

    def _check_view(self, xmlid, expected, model=PILL):
        arch = self._arch(xmlid, model)
        self.assertEqual(arch.tag, 'gantt', xmlid)
        self.assertEqual(dict(arch.attrib), expected, xmlid)

    def _check_action(self, number, view_xmlid, model=PILL, search_view=True):
        action = self.env.ref(f'{XML}host_action_h{number}')
        self.assertEqual(action.res_model, model)
        self.assertEqual(action.view_mode, 'gantt,list,form')
        self.assertEqual(action.view_id, self.env.ref(XML + view_xmlid))
        if search_view:
            self.assertEqual(action.search_view_id, self.env.ref(XML + 'host_view_h13'))
        menu = self.env.ref(f'{XML}host_menu_h{number}')
        self.assertEqual(menu.parent_id, self.env.ref(XML + 'host_menu_root'))
        self.assertEqual(menu.action, action)
        self.assertEqual(menu.sequence, number)

    def test_h33_multi_create_option(self):
        self._check_view('host_view_h33', {**BASE, 'multi_create_view': TEMPLATE_ONE})
        self._check_action(33, 'host_view_h33')
        self.assertFalse(self._context(33).get('group_by'))

    def test_h34_grouping(self):
        self._check_action(34, 'host_view_h33')
        self.assertEqual(self._context(34)['group_by'], ['parent_id', 'x_contact'])

    def test_h35_dated(self):
        self._check_view('host_view_h35', {
            'string': 'Dated pills', 'date_start': 'date_start', 'date_stop': 'date_stop',
            'default_range': 'week', 'plan': '0', 'multi_create_view': TEMPLATE_TWO,
        }, PILL2)
        self._check_action(35, 'host_view_h35', PILL2, search_view=False)

    def test_h36_schedule(self):
        self._check_view('host_view_h36', {**BASE, 'plan': '0', 'schedule': '1'})
        self._check_action(36, 'host_view_h36')

    def test_h37_grouping(self):
        self._check_action(37, 'host_view_h36')
        self.assertEqual(self._context(37)['group_by'], ['parent_id'])

    def test_h38_sample_schedule(self):
        self._check_view('host_view_h38', {
            'string': 'Pills', 'default_range': 'week', 'sample': '1',
            'date_start': 'date_start', 'date_stop': 'date_stop', 'schedule': '1',
        })
        self._check_action(38, 'host_view_h38')
        action = self.env.ref(XML + 'host_action_h38')
        h8 = self.env.ref(XML + 'host_action_h8')
        self.assertEqual(action.domain, h8.domain)
        self.assertEqual(action.help, h8.help)

    def test_h39_edit_off(self):
        self._check_view('host_view_h39', {**BASE, 'edit': '0', 'schedule': '1'})
        self._check_action(39, 'host_view_h39')

    def test_h40_both(self):
        self._check_view('host_view_h40', {
            **BASE, 'schedule': '1', 'multi_create_view': TEMPLATE_ONE})
        self._check_action(40, 'host_view_h40')

    def test_h41_grouping_by_creator(self):
        self._check_action(41, 'host_view_h36')
        self.assertEqual(self._context(41)['group_by'], ['parent_id', 'create_uid'])

    def test_validator_accepts_both_attributes(self):
        # the validator accepts both attributes: the view is valid and keeps them
        view = self.env.ref(XML + 'host_view_h40')
        view._check_xml()
        arch = etree.fromstring(view.arch_db)
        self.assertEqual(arch.get('schedule'), '1')
        self.assertEqual(arch.get('multi_create_view'), TEMPLATE_ONE)

    def _template(self, model, xmlid):
        views = self.env[model].with_context(form_view_ref=xmlid).get_views(
            [(False, 'form')])
        form = views['views']['form']
        self.assertEqual(form['id'], self.env.ref(xmlid).id)
        return etree.fromstring(form['arch'])

    def test_template_forms(self):
        arch = self._template(PILL, TEMPLATE_ONE)
        self.assertEqual(arch.tag, 'form')
        self.assertFalse(list(arch.iter('sheet')))
        fields = list(arch.iter('field'))
        self.assertEqual([f.get('name') for f in fields],
                         ['name', 'x_contact', 'x_tags', 'x_color'])
        by_name = {f.get('name'): f for f in fields}
        self.assertEqual(by_name['x_tags'].get('widget'), 'many2many_tags')
        self.assertEqual(by_name['name'].get('required'), '1')
        arch = self._template(PILL2, TEMPLATE_TWO)
        self.assertEqual(arch.tag, 'form')
        self.assertFalse(list(arch.iter('sheet')))
        fields = list(arch.iter('field'))
        self.assertEqual([f.get('name') for f in fields], ['name'])
        self.assertEqual(fields[0].get('required'), '1')
        # both have a high priority number; the first model keeps its own default form (the
        # second model has no other form view, so its only form is the template)
        for template in (TEMPLATE_ONE, TEMPLATE_TWO):
            self.assertEqual(self.env.ref(template).priority, 99)
        default = self.env[PILL].get_views([(False, 'form')])['views']['form']
        self.assertNotEqual(default['id'], self.env.ref(TEMPLATE_ONE).id)

    def test_host_adds_no_record(self):
        pill = self.env[PILL]
        pill.with_context(active_test=False).search([]).unlink()
        built = pill._tl_build_host_records(today='2026-11-12', tz_offset_hours=3)
        expected = len([r for r in built.values() if r._name == PILL])
        self.assertEqual(expected, 21)
        self.assertEqual(pill.with_context(active_test=False).search_count([]), expected)
