# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime

from odoo.exceptions import AccessError
from odoo.tests.common import new_test_user, tagged

from .common import TimerCase

_READER = 'base.group_user,test_timer.group_timer_test_reader'
_MANAGER = 'base.group_user,test_timer.group_timer_test_manager'


@tagged('post_install', '-at_install')
class TestTimerDelete(TimerCase):
    def _direct(self, record, user, **vals):
        return self.env['timer.timer'].sudo().create({
            'res_model': record._name, 'res_id': record.id, 'user_id': user.id,
            'timer_start': datetime(2026, 3, 4, 9, 0, 0), **vals})

    def _all_timers(self, record):
        return self.env['timer.timer'].sudo().search([
            ('res_model', '=', record._name), ('res_id', '=', record.id)])

    def test_A17_delete_removes_other_users_timers(self):
        timer = self._direct(self.doc_a, self.u2)
        self.doc_a.with_user(self.u1).unlink()
        self.assertFalse(self.doc_a.exists())
        self.assertFalse(timer.exists())

    def test_A18_delete_right_checked_first(self):
        reader = new_test_user(self.env, login='timer_reader', groups=_READER)
        manager = new_test_user(self.env, login='timer_manager', groups=_MANAGER)
        doc = self.env['timer.test.restricted'].with_user(manager).create({'name': 'D'})
        timer = self._direct(doc, manager)
        with self.assertRaises(AccessError):
            doc.with_user(reader).unlink()
        self.assertTrue(doc.exists())
        self.assertTrue(timer.exists())

    def test_A19_delete_removes_own_timer_too(self):
        own = self._direct(self.doc_a, self.u1)
        self.doc_a.with_user(self.u1).unlink()
        self.assertFalse(own.exists())
        own = self._direct(self.doc_b, self.u1)
        other = self._direct(self.doc_b, self.u2)
        self.doc_b.with_user(self.u1).unlink()
        self.assertFalse(own.exists())
        self.assertFalse(other.exists())
        self.assertFalse(self._all_timers(self.doc_b))

    def test_A27_interrupt_runs_with_system_rights(self):
        reader_group = self.env.ref('test_timer.group_timer_test_reader')
        manager = new_test_user(self.env, login='timer_manager2', groups=_MANAGER)
        user = new_test_user(self.env, login='timer_reader2', groups=_READER)
        doc = self.env['timer.test.restricted'].with_user(manager).create({'name': 'D'})
        doc.with_user(user).action_timer_start()
        timer = self._all_timers(doc)
        self.assertTrue(timer.is_timer_running)
        user.write({'group_ids': [(3, reader_group.id)]})
        self.env.invalidate_all()
        self.doc_a.with_user(user).action_timer_start()
        self.assertTrue(timer.timer_pause)
        self.assertTrue(self.timer_of(self.doc_a, user).is_timer_running)

    def test_R3_interrupt_skips_missing_document(self):
        self.env['timer.timer'].sudo().create({
            'res_model': 'timer.test', 'res_id': 999999, 'user_id': self.u1.id,
            'timer_start': datetime(2026, 3, 4, 9, 0, 0)})
        self.doc_a.with_user(self.u1).action_timer_start()
        self.assertTrue(self.doc_a.with_user(self.u1).is_timer_running)
