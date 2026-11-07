# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime
from unittest.mock import patch

from odoo.exceptions import AccessError, MissingError
from odoo.tests.common import new_test_user, tagged

from .common import TimerCase


@tagged('post_install', '-at_install')
class TestTimerParent(TimerCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        Parent = cls.env['timer.test.parent']
        cls.parent = Parent.create({'name': 'P'})
        cls.other_parent = Parent.create({'name': 'Q'})

    def _parent_timers(self, parent):
        return self.env['timer.timer'].sudo().search([
            ('parent_res_model', '=', parent._name), ('parent_res_id', '=', parent.id)])

    def test_A24_parent_start_stop(self):
        parent = self.parent.with_user(self.u1)
        parent.action_timer_start()
        timer = self._parent_timers(self.parent)
        self.assertEqual(timer.user_id, self.u1)
        self.assertEqual(timer.res_model, 'timer.test')
        child = self.env['timer.test'].browse(timer.res_id)
        self.assertEqual(child.name, 'P')
        self.assertEqual(timer.parent_res_id, self.parent.id)
        self.assertEqual(parent.user_timer_id, timer)
        self.assertTrue(parent.is_timer_running)
        self.assertEqual(parent._get_record_with_timer_running(), child)
        minutes = parent.action_timer_stop()
        self.assertGreaterEqual(minutes, 0)
        self.assertFalse(timer.exists())
        self.assertFalse(parent.user_timer_id)
        self.assertFalse(parent.is_timer_running)
        self.assertFalse(parent._get_record_with_timer_running())
        self.assertFalse(parent.action_timer_stop())

    def test_A24_parent_without_child_raises(self):
        empty = self.env['timer.test.parent.empty'].create({'name': 'E'})
        timers_before = self.env['timer.timer'].sudo().search_count([])
        with self.assertRaises(MissingError):
            empty.with_user(self.u1).action_timer_start()
        self.assertEqual(self.env['timer.timer'].sudo().search_count([]), timers_before)

    def test_A25_parent_running_search_restrictions(self):
        self.parent.with_user(self.u1).action_timer_start()
        Parent = self.env['timer.test.parent'].with_user(self.u2)
        scope = [('id', 'in', (self.parent | self.other_parent).ids)]
        self.assertEqual(Parent.search([*scope, ('is_timer_running', '=', True)]), self.parent)
        self.assertEqual(
            Parent.search([*scope, ('is_timer_running', '!=', True)]), self.other_parent)
        # The ORM turns every comparison on a boolean field into 'in'/'not in' with
        # booleans before it calls the search method (('=', 'x') becomes ('in', [True])
        # with a deprecation warning, ('>', True) is rejected by the ORM with a
        # ValueError). So no domain given to search() reaches the E8 branch: it is
        # reached by calling the method directly with an operator or a value that is
        # not "is"/"is not" with a boolean.
        bad_forms = (('=', 'x'), ('like', True), ('in', ['x']), ('in', []), ('not in', 'ab'))
        for operator, value in bad_forms:
            with self.subTest(operator=operator, value=value):
                with self.assertRaises(NotImplementedError):
                    Parent._search_is_timer_running(operator, value)
        both = Parent.search([*scope, ('is_timer_running', 'in', [True, False])])
        self.assertEqual(both, self.parent | self.other_parent)

    def test_A25_parent_user_timer_search(self):
        self.parent.with_user(self.u1).action_timer_start()
        scope = [('id', 'in', (self.parent | self.other_parent).ids)]
        own = self.env['timer.test.parent'].with_user(self.u1)
        other = self.env['timer.test.parent'].with_user(self.u2)
        self.assertEqual(own.search([*scope, ('user_timer_id', '!=', False)]), self.parent)
        self.assertEqual(own.search([*scope, ('user_timer_id', '=', False)]), self.other_parent)
        self.assertFalse(other.search([*scope, ('user_timer_id', '!=', False)]))
        timer = self._parent_timers(self.parent)
        self.assertEqual(own.search([*scope, ('user_timer_id', 'in', timer.ids)]), self.parent)

    def test_A32_parent_delete_and_cross_model_interrupt(self):
        self.parent.with_user(self.u2).action_timer_start()
        self.parent.with_user(self.u1).action_timer_start()
        timers = self._parent_timers(self.parent)
        self.assertEqual(timers.user_id, self.u1 | self.u2)
        self.parent.with_user(self.u1).unlink()
        self.assertFalse(self.parent.exists())
        self.assertFalse(timers.exists())

        self.other_parent.with_user(self.u1).action_timer_start()
        timer = self._parent_timers(self.other_parent)
        self.assertTrue(timer.is_timer_running)
        self.doc_a.with_user(self.u1).action_timer_start()
        self.assertTrue(timer.timer_pause)
        self.assertFalse(timer.is_timer_running)
        self.assertTrue(self.timer_of(self.doc_a, self.u1).is_timer_running)

    def test_A32_parent_delete_right_checked_first(self):
        restricted = new_test_user(self.env, login='timer_portal2', groups='base.group_portal')
        self.parent.with_user(self.u1).action_timer_start()
        timer = self._parent_timers(self.parent)
        Timer = self.registry['timer.timer']
        with patch.object(Timer, 'unlink', autospec=True, side_effect=Timer.unlink) as unlink_spy:
            with self.assertRaises(AccessError):
                self.parent.with_user(restricted).unlink()
        unlink_spy.assert_not_called()
        self.assertTrue(self.parent.exists())
        self.assertTrue(timer.exists())

    def test_parent_other_users_timers_excludes_own(self):
        self.parent.with_user(self.u1).action_timer_start()
        self.parent.with_user(self.u2).action_timer_start()
        found = self.parent.with_user(self.u1)._get_timers_from_other_users()
        self.assertEqual(found.user_id, self.u2)
        self.assertEqual(found.parent_res_id, self.parent.id)

    def test_parent_user_timers_are_all_of_the_user(self):
        self.doc_a.with_user(self.u1).action_timer_start()
        timers = self.parent.with_user(self.u1)._get_user_timers()
        self.assertEqual(timers, self.timer_of(self.doc_a, self.u1))

    def test_D1_parent_unlink_uses_other_users_hook(self):
        Parent = type(self.env['timer.test.parent'])
        parent = self.env['timer.test.parent'].create({'name': 'H'})
        parent.with_user(self.u1).action_timer_start()
        with patch.object(
            Parent, '_get_timers_from_other_users', autospec=True,
            side_effect=Parent._get_timers_from_other_users,
        ) as hook:
            parent.with_user(self.u2).unlink()
        hook.assert_called()
        self.assertFalse(self._parent_timers(parent))

    def test_R7_parent_stop_with_missing_child_clears_timer(self):
        parent = self.env['timer.test.parent'].create({'name': 'O'})
        timer = self.env['timer.timer'].sudo().create({
            'res_model': 'timer.test', 'res_id': 999999, 'user_id': self.u1.id,
            'parent_res_model': parent._name, 'parent_res_id': parent.id,
            'timer_start': datetime(2026, 3, 4, 9, 0, 0)})
        as_u1 = parent.with_user(self.u1)
        self.assertTrue(as_u1.is_timer_running)
        minutes = as_u1.action_timer_stop()
        self.assertGreater(minutes, 0)
        self.assertFalse(timer.exists())
        self.assertFalse(as_u1.is_timer_running)

    def test_R7_parent_stop_with_missing_child_never_started(self):
        parent = self.env['timer.test.parent'].create({'name': 'O2'})
        timer = self.env['timer.timer'].sudo().create({
            'res_model': 'timer.test', 'res_id': 999999, 'user_id': self.u1.id,
            'parent_res_model': parent._name, 'parent_res_id': parent.id})
        self.assertFalse(parent.with_user(self.u1).action_timer_stop())
        self.assertFalse(timer.exists())
