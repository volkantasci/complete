# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime

from freezegun import freeze_time
from odoo import fields
from odoo.addons.timer.utils import round_time_spent
from odoo.exceptions import AccessError
from odoo.tests.common import tagged
from odoo.tools import mute_logger
from psycopg2 import IntegrityError

from .common import TimerCase


def _vals(doc, user, **extra):
    return {'res_model': doc._name, 'res_id': doc.id, 'user_id': user.id, **extra}


@tagged('post_install', '-at_install')
class TestTimerRecord(TimerCase):
    def test_A11_duplicate_timer_refused(self):
        Timer = self.env['timer.timer'].with_user(self.u1)
        Timer.create(_vals(self.doc_a, self.u1))
        with self.assertRaises(IntegrityError), mute_logger('odoo.sql_db'), self.cr.savepoint():
            Timer.create(_vals(self.doc_a, self.u1))
        self.assertEqual(len(self.timer_of(self.doc_a, self.u1)), 1)

    def test_A12_other_users_timers_read_only(self):
        now = fields.Datetime.now()
        timer = self.env['timer.timer'].with_user(self.u1).create(
            _vals(self.doc_a, self.u1, timer_start=now))
        as_u2 = self.env['timer.timer'].with_user(self.u2)
        self.assertIn(timer, as_u2.search([]))
        with self.assertRaises(AccessError):
            timer.with_user(self.u2).write({'timer_pause': now})
        with self.assertRaises(AccessError):
            timer.with_user(self.u2).unlink()
        with self.assertRaises(AccessError):
            as_u2.create(_vals(self.doc_b, self.u1))
        with self.assertRaises(AccessError):
            as_u2.create({'res_model': self.doc_b._name, 'res_id': self.doc_b.id})
        with self.assertRaises(AccessError):
            timer.with_user(self.admin).unlink()
        self.assertTrue(timer.exists())

    def test_A20_server_clock(self):
        with freeze_time('2026-03-04 05:06:07.891'):
            result = self.env['timer.timer'].with_user(self.u1).get_server_time()
            self.assertEqual(result, datetime(2026, 3, 4, 5, 6, 7))
            self.assertEqual(result, fields.Datetime.now())
        method = type(self.env['timer.timer']).get_server_time
        self.assertTrue(getattr(method, '_readonly', False))

    def test_A21_rounding_helper(self):
        self.assertEqual(round_time_spent(4.5, 10, 5), 10)
        self.assertEqual(round_time_spent(12.4, 10, 5), 15)
        self.assertEqual(round_time_spent(12.4, 0, 0), 12.4)
        self.assertEqual(round_time_spent(15, 10, 5), 15)
        self.assertEqual(round_time_spent(0, 0, 15), 0)

    def test_A31_portal_has_no_timer_access(self):
        timer = self.env['timer.timer'].with_user(self.u1).create(_vals(self.doc_a, self.u1))
        as_portal = self.env['timer.timer'].with_user(self.portal)
        with self.assertRaises(AccessError):
            as_portal.search([])
        with self.assertRaises(AccessError):
            timer.with_user(self.portal).read(['timer_start'])
        with self.assertRaises(AccessError):
            as_portal.create(_vals(self.doc_a, self.portal))
        with self.assertRaises(AccessError):
            timer.with_user(self.portal).write({'timer_pause': fields.Datetime.now()})
        with self.assertRaises(AccessError):
            timer.with_user(self.portal).unlink()

    def test_timer_record_minutes_and_actions(self):
        Timer = self.env['timer.timer'].with_user(self.u1)
        timer = Timer.create(_vals(self.doc_a, self.u1))
        self.assertFalse(timer.is_timer_running)
        self.assertFalse(timer.action_timer_stop())
        timer.action_timer_pause()
        self.assertFalse(timer.timer_pause)
        with freeze_time('2026-03-04 09:00:00'):
            timer.action_timer_start()
            self.assertEqual(timer.timer_start, datetime(2026, 3, 4, 9, 0, 0))
            self.assertTrue(timer.is_timer_running)
        with freeze_time('2026-03-04 09:05:00'):
            timer.action_timer_start()  # start only sets an empty start
            self.assertEqual(timer.timer_start, datetime(2026, 3, 4, 9, 0, 0))
            self.assertAlmostEqual(timer._get_minutes_spent(), 5.0)
        with freeze_time('2026-03-04 09:10:00'):
            timer.action_timer_pause()
            self.assertEqual(timer.timer_pause, datetime(2026, 3, 4, 9, 10, 0))
            self.assertFalse(timer.is_timer_running)
        with freeze_time('2026-03-04 09:20:00'):
            timer.action_timer_pause()  # second pause ignored
            self.assertEqual(timer.timer_pause, datetime(2026, 3, 4, 9, 10, 0))
            self.assertAlmostEqual(timer._get_minutes_spent(), 10.0)
        with freeze_time('2026-03-04 09:30:00'):
            timer.action_timer_resume()
            self.assertFalse(timer.timer_pause)
            self.assertEqual(timer.timer_start, datetime(2026, 3, 4, 9, 20, 0))
            self.assertTrue(timer.is_timer_running)
        with freeze_time('2026-03-04 09:45:00'):
            self.assertAlmostEqual(timer.action_timer_stop(), 25.0)
        self.assertTrue(timer.exists())
        self.assertFalse(timer.timer_start or timer.timer_pause)
        self.assertEqual(timer._get_related_document(), self.doc_a)
        self.assertEqual(Timer._get_timers(), timer)
        self.assertFalse(self.env['timer.timer'].with_user(self.u2)._get_timers())

    def test_R3_get_related_document_missing(self):
        Timer = self.env['timer.timer']
        found = Timer.create(_vals(self.doc_a, self.u1))
        self.assertEqual(found._get_related_document(), self.doc_a)
        stale = Timer.create({'res_model': 'timer.test', 'res_id': 999999, 'user_id': self.u1.id})
        self.assertFalse(stale._get_related_document())
        unknown = Timer.create({'res_model': 'no.such.model', 'res_id': 1, 'user_id': self.u1.id})
        self.assertFalse(unknown._get_related_document())

    def test_A29_record_pause_never_started_unchanged(self):
        timer = self.env['timer.timer'].with_user(self.u1).create(_vals(self.doc_a, self.u1))
        timer.action_timer_pause()
        self.assertFalse(timer.timer_start or timer.timer_pause)

    def test_A30_record_resume_running_unchanged(self):
        start = datetime(2026, 3, 4, 9, 0, 0)
        timer = self.env['timer.timer'].with_user(self.u1).create(
            _vals(self.doc_a, self.u1, timer_start=start))
        with freeze_time('2026-03-04 09:05:00'):
            timer.action_timer_resume()
        self.assertEqual(timer.timer_start, start)
        self.assertFalse(timer.timer_pause)
