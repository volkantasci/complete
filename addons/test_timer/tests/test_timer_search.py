# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime

from odoo.tests.common import tagged

from .common import TimerCase


@tagged('post_install', '-at_install')
class TestTimerSearch(TimerCase):
    def _direct(self, record, user, **vals):
        return self.env['timer.timer'].sudo().create({
            'res_model': record._name, 'res_id': record.id, 'user_id': user.id,
            'timer_start': datetime(2026, 3, 4, 9, 0, 0), **vals})

    def _search(self, user, domain):
        docs = self.doc_a | self.doc_b | self.doc_c
        return self.env['timer.test'].with_user(user).search([('id', 'in', docs.ids)] + domain)

    def test_A15_running_search_all_users(self):
        self._direct(self.doc_a, self.u1)
        self._direct(self.doc_b, self.u2, timer_pause=datetime(2026, 3, 4, 9, 30, 0))
        bc = self.doc_b | self.doc_c
        self.assertEqual(self._search(self.u2, [('is_timer_running', '=', True)]), self.doc_a)
        self.assertEqual(self._search(self.u2, [('is_timer_running', '!=', False)]), self.doc_a)
        self.assertEqual(self._search(self.u2, [('is_timer_running', '=', False)]), bc)
        self.assertEqual(self._search(self.u2, [('is_timer_running', '!=', True)]), bc)
        self.assertEqual(self._search(self.u2, ['!', ('is_timer_running', '=', True)]), bc)

    def test_A16_current_user_timer_search(self):
        self._direct(self.doc_a, self.u1, timer_pause=datetime(2026, 3, 4, 9, 30, 0))
        self._direct(self.doc_b, self.u2)
        rest = self.doc_b | self.doc_c
        self.assertEqual(self._search(self.u1, [('user_timer_id', '!=', False)]), self.doc_a)
        self.assertEqual(self._search(self.u1, [('user_timer_id', '=', False)]), rest)
