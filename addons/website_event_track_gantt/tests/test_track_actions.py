# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.addons.website_event_track_gantt.hooks import restore_track_actions
from odoo.tests.common import TransactionCase
from odoo.tools import convert_file
from odoo.tools.safe_eval import safe_eval

_WITH_GANTT = 'kanban,list,form,gantt,calendar,graph,activity'
_COMMUNITY = 'kanban,list,form,calendar,graph,activity'


class TestTrackActions(TransactionCase):
    def setUp(self):
        super().setUp()
        self.menu_action = self.env.ref('website_event_track.action_event_track')
        self.event_action = self.env.ref('website_event_track.action_event_track_from_event')

    def _context_of(self, action):
        return safe_eval(action.context or '{}', {'active_id': False})

    def test_a28_view_modes_in_order(self):
        self.assertEqual(self.menu_action.view_mode, _WITH_GANTT)
        self.assertEqual(self.event_action.view_mode, _WITH_GANTT)

    def test_a28_menu_action_context(self):
        context = self._context_of(self.menu_action)
        self.assertEqual(context, {'default_scale': 'year', 'search_default_location': 1})

    def test_a28_event_action_context_unchanged(self):
        self.assertEqual(
            self.event_action.context,
            "{'search_default_event_id': active_id, 'default_event_id': active_id}",
        )

    def test_a27_uninstall_removes_gantt(self):
        restore_track_actions(self.env)
        self.assertEqual(self.menu_action.view_mode, _COMMUNITY)
        self.assertEqual(self.event_action.view_mode, _COMMUNITY)
        self.assertNotIn('gantt', self.menu_action.view_mode)
        self.assertEqual(self._context_of(self.menu_action), {})
        self.assertEqual(
            self.event_action.context,
            "{'search_default_event_id': active_id, 'default_event_id': active_id}",
        )

    def test_a27_reinstall_restores_view_mode(self):
        # A real uninstall and reinstall cannot run inside a test; the hook's
        # effect and the reload of the module's own XML are tested in turn.
        restore_track_actions(self.env)
        self.assertNotIn('gantt', self.menu_action.view_mode)
        convert_file(
            self.env, 'website_event_track_gantt', 'views/event_track_views.xml', {}, 'update')
        self.menu_action.invalidate_recordset()
        self.event_action.invalidate_recordset()
        self.assertEqual(self.menu_action.view_mode, _WITH_GANTT)
        self.assertEqual(self.event_action.view_mode, _WITH_GANTT)
        self.assertEqual(self._context_of(self.menu_action),
                         {'default_scale': 'year', 'search_default_location': 1})
