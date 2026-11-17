# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import ast

from lxml import etree
from odoo import Command
from odoo.exceptions import AccessError
from odoo.tests.common import TransactionCase, tagged

PILL = 'test.web.gantt.pill'
XML = 'test_web_gantt.'


@tagged('post_install', '-at_install')
class TestTimelineDragHost(TransactionCase):
    def _arch(self, xmlid):
        view = self.env.ref(XML + xmlid)
        views = self.env[PILL].get_views([(view.id, 'gantt')])['views']
        return etree.fromstring(views['gantt']['arch'])

    def _context(self, number):
        return ast.literal_eval(self.env.ref(f'{XML}host_action_h{number}').context)

    def _check_base(self, arch, xmlid):
        self.assertEqual(arch.tag, 'gantt', xmlid)
        self.assertEqual(arch.get('string'), 'Pills', xmlid)
        self.assertEqual(arch.get('date_start'), 'date_start', xmlid)
        self.assertEqual(arch.get('date_stop'), 'date_stop', xmlid)
        self.assertEqual(arch.get('default_range'), 'week', xmlid)
        self.assertEqual(arch.get('color'), 'x_color', xmlid)
        self.assertEqual(arch.get('plan'), '0', xmlid)

    def _check_action(self, number, view_xmlid):
        action = self.env.ref(f'{XML}host_action_h{number}')
        self.assertEqual(action.res_model, PILL)
        self.assertEqual(action.view_mode, 'gantt,list,form')
        self.assertEqual(action.view_id, self.env.ref(XML + view_xmlid))
        menu = self.env.ref(f'{XML}host_menu_h{number}')
        self.assertEqual(menu.parent_id, self.env.ref(XML + 'host_menu_root'))
        self.assertEqual(menu.action, action)

    def test_h30_view_and_grouping(self):
        arch = self._arch('host_view_h30')
        self._check_base(arch, 'h30')
        self.assertIsNone(arch.get('disable_drag_drop'))
        self._check_action(30, 'host_view_h30')
        self.assertEqual(self._context(30)['group_by'], ['parent_id', 'create_uid'])

    def test_h31_drag_drop_off(self):
        arch = self._arch('host_view_h31')
        self._check_base(arch, 'h31')
        self.assertEqual(arch.get('disable_drag_drop'), '1')
        self._check_action(31, 'host_view_h31')
        self.assertFalse(self._context(31).get('group_by'))

    def test_h32_grouping(self):
        # the view of H30, one more grouping level
        self._check_action(32, 'host_view_h30')
        self.assertEqual(
            self._context(32)['group_by'], ['parent_id', 'create_uid', 'x_contact'])
        self.assertEqual(self.env[PILL]._fields['create_uid'].readonly, True)

    def test_host_records_are_created_by_the_administrator(self):
        # start from a clean host (demo data holds the same records), then build it from a
        # user who is not the administrator: the builder alone must make the administrator
        # the creator of every record
        pill = self.env[PILL]
        pill.with_context(active_test=False).search([]).unlink()
        names = [f'Host Contact {i}' for i in (1, 2, 3)]
        self.env['res.partner'].with_context(active_test=False).search(
            [('name', 'in', names)]).unlink()
        self.env['res.partner.category'].search(
            [('name', 'in', ['Host Tag 1', 'Host Tag 2'])]).unlink()
        admin = self.env.ref('base.user_admin')
        other = self.env['res.users'].create({
            'name': 'Host builder',
            'login': 'host_builder',
            'group_ids': [Command.set([self.env.ref('base.group_user').id])],
        })
        self.assertNotEqual(other, admin)
        built = pill.with_user(other)._tl_build_host_records(
            today='2026-11-12', tz_offset_hours=3)
        for key in ('C1', 'C2', 'C3', 'T1', 'T2', 'Alpha', 'Beta', 'Gamma'):
            self.assertEqual(built[key].sudo().create_uid, admin, key)
        pills = pill.browse([r.id for r in built.values() if r._name == PILL])
        self.assertTrue(pills)
        self.assertEqual(pills.sudo().create_uid, admin)

    def test_rtl_user(self):
        user = self.env[PILL]._tl_rtl_user(self.env)
        admin = self.env.ref('base.user_admin')
        self.assertTrue(user.active)
        self.assertEqual(user.name, 'RTL Admin')
        self.assertEqual(user.login, 'rtl')
        self.assertEqual(user.lang, 'ar_001')
        self.assertTrue(self.env['res.lang']._lang_get('ar_001').active)
        # the user takes the administrator's groups when it is created (by the demo data at
        # install); modules installed afterwards may give the administrator more groups
        self.assertTrue(user.group_ids <= admin.group_ids)
        self.assertTrue(user.has_group('base.group_system'))
        self.assertEqual(user.tz, admin.tz)
        # asking again returns the same user
        self.assertEqual(self.env[PILL]._tl_rtl_user(self.env), user)
        # the view's own Arabic words (the unit of a resize badge's difference) reach the browser
        words, params = self.env['ir.http']._get_translations_for_webclient(['web_gantt'], 'ar_001')
        self.assertEqual(params['direction'], 'rtl')
        terms = {m['id']: m['string'] for m in words['web_gantt']['messages']}
        self.assertEqual(
            [terms[unit] for unit in ('minutes', 'hours', 'days', 'months')],
            ['دقائق', 'ساعات', 'أيام', 'أشهر'])


@tagged('post_install', '-at_install')
class TestTimelineUndoMethod(TransactionCase):
    def _pill(self, **values):
        values.setdefault('name', 'Undo pill')
        values.setdefault('date_start', '2026-03-02 08:00:00')
        values.setdefault('date_stop', '2026-03-02 10:00:00')
        return self.env[PILL].create(values)

    def test_a46_reschedule_writes(self):
        pill = self._pill()
        result = pill.gantt_undo_drag_drop('reschedule', {
            'date_start': '2026-03-01 06:00:00',
            'date_stop': '2026-03-01 07:30:00',
        })
        self.assertTrue(result)
        self.assertEqual(str(pill.date_start), '2026-03-01 06:00:00')
        self.assertEqual(str(pill.date_stop), '2026-03-01 07:30:00')

    def test_a46_copy_deletes(self):
        pill = self._pill()
        pill_id = pill.id
        self.assertTrue(pill.gantt_undo_drag_drop('copy', {}))
        self.assertFalse(self.env[PILL].browse(pill_id).exists())

    def test_a46_gone_record_false(self):
        pill = self._pill()
        pill.unlink()
        self.assertIs(pill.gantt_undo_drag_drop('copy', {}), False)
        self.assertIs(pill.gantt_undo_drag_drop('reschedule', {'name': 'x'}), False)

    def test_a46_empty_mapping_false(self):
        pill = self._pill()
        self.assertIs(pill.gantt_undo_drag_drop('reschedule', {}), False)
        self.assertIs(pill.gantt_undo_drag_drop('reschedule'), False)
        self.assertEqual(pill.name, 'Undo pill')

    def test_a46_other_kind_false(self):
        pill = self._pill()
        self.assertIs(pill.gantt_undo_drag_drop('resize', {'name': 'x'}), False)
        self.assertIs(pill.gantt_undo_drag_drop('', {'name': 'x'}), False)
        self.assertEqual(pill.name, 'Undo pill')
        self.assertTrue(pill.exists())

    def test_a46_no_write_right_access_error(self):
        pill = self._pill()
        # internal users may only read the test pills (security/ir.access.csv)
        user = self.env['res.users'].create({
            'name': 'Undo reader',
            'login': 'undo_reader_a46',
            'group_ids': [Command.set(self.env.ref('base.group_user').ids)],
        })
        as_user = pill.with_user(user)
        with self.assertRaises(AccessError):
            as_user.gantt_undo_drag_drop('reschedule', {'name': 'changed'})
        with self.assertRaises(AccessError):
            as_user.gantt_undo_drag_drop('copy', {})
        self.assertEqual(pill.name, 'Undo pill')
