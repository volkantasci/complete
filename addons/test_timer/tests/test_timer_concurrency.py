# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import SUPERUSER_ID, api, fields
from odoo.tests.common import TransactionCase, new_test_user, tagged
from odoo.tools import mute_logger
from psycopg2 import IntegrityError

from .common import TimerCase


def _vals(doc, user, **extra):
    return {'res_model': doc._name, 'res_id': doc.id, 'user_id': user.id, **extra}


@tagged('post_install', '-at_install')
class TestTimerOneRunning(TimerCase):
    def test_RW1_second_running_timer_refused_by_database(self):
        Timer = self.env['timer.timer'].with_user(self.u1)
        now = fields.Datetime.now()
        Timer.create(_vals(self.doc_a, self.u1, timer_start=now))
        with self.assertRaises(IntegrityError), mute_logger('odoo.sql_db'), self.cr.savepoint():
            Timer.create(_vals(self.doc_b, self.u1, timer_start=now))
        running = self.env['timer.timer'].sudo().search([
            ('user_id', '=', self.u1.id), ('timer_start', '!=', False),
            ('timer_pause', '=', False)])
        self.assertEqual(running.mapped('res_id'), [self.doc_a.id])

    def test_RW1_paused_and_never_started_timers_not_limited(self):
        Timer = self.env['timer.timer'].with_user(self.u1)
        now = fields.Datetime.now()
        Timer.create(_vals(self.doc_a, self.u1, timer_start=now))
        Timer.create(_vals(self.doc_b, self.u1, timer_start=now, timer_pause=now))
        Timer.create(_vals(self.doc_c, self.u1, timer_start=now, timer_pause=now))
        extra = self.env['timer.test'].create([{'name': 'N1'}, {'name': 'N2'}])
        Timer.create([_vals(doc, self.u1) for doc in extra])
        self.assertEqual(len(Timer.search([('user_id', '=', self.u1.id)])), 5)

    def test_RW1_start_flow_still_interrupts_in_one_transaction(self):
        self.doc_a.with_user(self.u1).action_timer_start()
        self.doc_b.with_user(self.u1).action_timer_start()
        self.doc_a.with_user(self.u1).action_timer_start()
        self.assertTrue(self.timer_of(self.doc_a, self.u1).is_timer_running)
        self.assertFalse(self.timer_of(self.doc_b, self.u1).is_timer_running)

    def test_RW1_resume_several_records_keeps_one_running(self):
        user = self.u1
        docs = self.doc_a | self.doc_b | self.doc_c
        for doc in docs:
            doc.with_user(user).action_timer_start()
            doc.with_user(user).action_timer_pause()
        docs.with_user(user).action_timer_resume()
        running = self.env['timer.timer'].sudo().search([
            ('user_id', '=', user.id)]).filtered('is_timer_running')
        self.assertEqual(running, self.timer_of(self.doc_c, user))


@tagged('post_install', '-at_install')
class TestTimerConcurrentStarts(TransactionCase):
    def setUp(self):
        super().setUp()
        registry = self.env.registry
        self.addCleanup(self._clean_up)
        with registry.cursor() as cr:
            env = api.Environment(cr, SUPERUSER_ID, {})
            user = new_test_user(env, login='timer_rw1_user', groups='base.group_user')
            docs = env['timer.test'].create([{'name': 'RW1 X'}, {'name': 'RW1 Y'}])
            self.user_id, self.doc_ids = user.id, docs.ids
        self.envs = [
            api.Environment(registry.cursor(), self.user_id, {}),
            api.Environment(registry.cursor(), self.user_id, {}),
        ]
        self.addCleanup(lambda: [env.cr.close() for env in self.envs])

    def _clean_up(self):
        with self.env.registry.cursor() as cr:
            env = api.Environment(cr, SUPERUSER_ID, {})
            env['timer.timer'].search([('user_id', '=', self.user_id)]).unlink()
            env['timer.test'].browse(self.doc_ids).unlink()
            env['res.users'].browse(self.user_id).unlink()

    def test_RW1_concurrent_starts_leave_one_running_timer(self):
        env1, env2 = self.envs
        doc1 = env1['timer.test'].browse(self.doc_ids[0])
        doc2 = env2['timer.test'].browse(self.doc_ids[1])
        # The second transaction looks for a running timer before the first has one.
        doc2.sudo()._stop_timer_in_progress()
        doc1.action_timer_start()
        env1.cr.commit()
        # The second start does not see the first one: the database refuses it.
        with self.assertRaises(IntegrityError), mute_logger('odoo.sql_db'):
            doc2._create_timer({'timer_start': fields.Datetime.now()})
            env2.cr.flush()
        env2.cr.rollback()
        with self.env.registry.cursor() as cr:
            env = api.Environment(cr, SUPERUSER_ID, {})
            running = env['timer.timer'].search([
                ('user_id', '=', self.user_id), ('timer_start', '!=', False),
                ('timer_pause', '=', False)])
            self.assertEqual(running.mapped('res_id'), [self.doc_ids[0]])
