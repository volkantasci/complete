# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import fields
from odoo.exceptions import AccessError, MissingError
from odoo.tests.common import new_test_user, tagged

from .common import TimerCase


@tagged('post_install', '-at_install')
class TestTimerStartRights(TimerCase):
    def _running_elsewhere(self, user):
        self.doc_a.with_user(user).action_timer_start()
        timer = self.timer_of(self.doc_a, user)
        self.assertTrue(timer.is_timer_running)
        return timer

    def _timer_count(self):
        return self.env['timer.timer'].sudo().search_count([])

    def test_RW2_start_on_missing_document_refused(self):
        running = self._running_elsewhere(self.u1)
        gone = self.env['timer.test'].create({'name': 'Gone'})
        missing = gone.with_user(self.u1)
        gone.unlink()
        count = self._timer_count()
        with self.assertRaises(MissingError):
            missing.action_timer_start()
        self.assertEqual(self._timer_count(), count)
        self.assertTrue(running.is_timer_running)

    def test_RW2_start_on_unreadable_document_refused(self):
        running = self._running_elsewhere(self.u1)
        doc = self.env['timer.test.restricted'].create({'name': 'Hidden'})
        count = self._timer_count()
        with self.assertRaises(AccessError):
            doc.with_user(self.u1).action_timer_start()
        self.assertEqual(self._timer_count(), count)
        self.assertTrue(running.is_timer_running)

    def test_RW2_parent_start_needs_readable_parent(self):
        user = new_test_user(self.env, login='timer_rw2_portal', groups='base.group_portal')
        parent = self.env['timer.test.parent'].create({'name': 'P'})
        running = self.env['timer.timer'].sudo().create({
            'res_model': 'timer.test', 'res_id': self.doc_a.id, 'user_id': user.id,
            'timer_start': fields.Datetime.now()})
        count = self._timer_count()
        with self.assertRaises(AccessError):
            parent.with_user(user).action_timer_start()
        self.assertEqual(self._timer_count(), count)
        self.assertTrue(running.is_timer_running)
        gone = self.env['timer.test.parent'].create({'name': 'Gone'})
        missing = gone.with_user(self.u1)
        gone.unlink()
        with self.assertRaises(MissingError):
            missing.action_timer_start()
