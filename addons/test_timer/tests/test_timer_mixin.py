# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime, timedelta

from freezegun import freeze_time
from odoo.tests.common import tagged

from .common import TimerCase


def _dt(hms, day='2026-03-04'):
    return datetime.strptime(f'{day} {hms}', '%Y-%m-%d %H:%M:%S')


@tagged('post_install', '-at_install')
class TestTimerMixin(TimerCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.doc_i = cls.env['timer.test.interruption'].create({})

    def as_(self, record, user=None):
        return record.with_user(user or self.u1)

    def _direct(self, record, user=None, **vals):
        return self.env['timer.timer'].sudo().create({
            'res_model': record._name, 'res_id': record.id,
            'user_id': (user or self.u1).id, **vals})

    def test_A1_start_creates_one_running_timer(self):
        with freeze_time('2026-03-04 10:00:00'):
            self.as_(self.doc_a).action_timer_start()
            timer = self.timer_of(self.doc_a, self.u1)
            self.assertEqual(len(timer), 1)
            self.assertEqual(timer.timer_start, _dt('10:00:00'))
            self.assertFalse(timer.timer_pause)
            doc = self.as_(self.doc_a)
            self.assertTrue(doc.is_timer_running)
            self.assertEqual(doc.timer_start, _dt('10:00:00'))
            self.assertEqual(doc.user_timer_id, timer)

    def test_A2_stop_returns_unrounded_minutes(self):
        doc = self.as_(self.doc_a)
        with freeze_time('2026-03-04 10:00:00'):
            doc.action_timer_start()
        with freeze_time('2026-03-04 10:00:04'):
            result = doc.action_timer_stop()
        self.assertAlmostEqual(result, 4 / 60, places=4)
        self.assertFalse(self.timer_of(self.doc_a, self.u1))
        self.assertFalse(doc.user_timer_id)
        self.assertFalse(doc.is_timer_running)

    def test_A3_start_second_document_pauses_first(self):
        with freeze_time('2026-03-04 10:00:00'):
            self.as_(self.doc_a).action_timer_start()
        with freeze_time('2026-03-04 10:05:00'):
            self.as_(self.doc_b).action_timer_start()
        a = self.timer_of(self.doc_a, self.u1)
        b = self.timer_of(self.doc_b, self.u1)
        self.assertEqual(a.timer_pause, _dt('10:05:00'))
        self.assertTrue(b.is_timer_running)
        self.assertEqual(b.timer_start, _dt('10:05:00'))

    def test_A4_resume_interrupts_running_timer(self):
        self._direct(self.doc_a, timer_start=_dt('09:00:00'), timer_pause=_dt('09:30:00'))
        self._direct(self.doc_b, timer_start=_dt('09:30:00'))
        with freeze_time('2026-03-04 10:00:00'):
            self.as_(self.doc_a).action_timer_resume()
        a = self.timer_of(self.doc_a, self.u1)
        b = self.timer_of(self.doc_b, self.u1)
        self.assertEqual(a.timer_start, _dt('09:30:00'))
        self.assertFalse(a.timer_pause)
        self.assertEqual(b.timer_pause, _dt('10:00:00'))

    def test_A5_start_on_paused_resumes(self):
        self._direct(self.doc_a, timer_start=_dt('09:00:00'), timer_pause=_dt('09:10:00'))
        with freeze_time('2026-03-04 09:20:00'):
            self.as_(self.doc_a).action_timer_start()
        timer = self.timer_of(self.doc_a, self.u1)
        self.assertEqual(timer.timer_start, _dt('09:10:00'))
        self.assertFalse(timer.timer_pause)

    def test_A6_start_on_running_keeps_start(self):
        self._direct(self.doc_a, timer_start=_dt('09:00:00'))
        with freeze_time('2026-03-04 09:05:00'):
            self.as_(self.doc_a).action_timer_start()
        timer = self.timer_of(self.doc_a, self.u1)
        self.assertTrue(timer.is_timer_running)
        self.assertEqual(timer.timer_start, _dt('09:00:00'))

    def test_A7_stop_on_paused_counts_to_pause(self):
        self._direct(self.doc_a, timer_start=_dt('09:00:00'), timer_pause=_dt('09:30:00'))
        with freeze_time('2026-03-04 11:00:00'):
            self.assertAlmostEqual(self.as_(self.doc_a).action_timer_stop(), 30.0)
        self.assertFalse(self.timer_of(self.doc_a, self.u1))

    def test_A8_no_timer_stop_pause_resume_are_noops(self):
        doc = self.as_(self.doc_a)
        self.assertIs(doc.action_timer_stop(), False)
        doc.action_timer_pause()
        doc.action_timer_resume()
        self.assertFalse(self.timer_of(self.doc_a, self.u1))
        self.assertFalse(doc.is_timer_running)

    def test_A9_interruption_that_stops(self):
        for action in ('action_timer_resume', 'action_timer_start'):
            with self.subTest(action=action):
                self.env['timer.timer'].sudo().search([('user_id', '=', self.u1.id)]).unlink()
                self._direct(self.doc_b, timer_start=_dt('09:00:00'), timer_pause=_dt('09:10:00'))
                with freeze_time('2026-03-04 09:20:00'):
                    self.as_(self.doc_i).action_timer_start()
                    self.assertTrue(self.timer_of(self.doc_i, self.u1))
                with freeze_time('2026-03-04 09:30:00'):
                    getattr(self.as_(self.doc_b), action)()
                self.assertFalse(self.timer_of(self.doc_i, self.u1))
                self.assertTrue(self.timer_of(self.doc_b, self.u1).is_timer_running)

    def test_A10_two_users_same_document(self):
        self.as_(self.doc_a, self.u1).action_timer_start()
        self.as_(self.doc_a, self.u2).action_timer_start()
        self.assertEqual(len(self.env['timer.timer'].sudo().search(
            [('res_model', '=', 'timer.test'), ('res_id', '=', self.doc_a.id)])), 2)
        self.assertEqual(
            self.as_(self.doc_a, self.u1).user_timer_id, self.timer_of(self.doc_a, self.u1))
        self.assertEqual(
            self.as_(self.doc_a, self.u2).user_timer_id, self.timer_of(self.doc_a, self.u2))
        self.as_(self.doc_a, self.u2).action_timer_stop()
        self.assertTrue(self.timer_of(self.doc_a, self.u1))
        self.assertFalse(self.timer_of(self.doc_a, self.u2))

    def test_A13_second_pause_ignored(self):
        doc = self.as_(self.doc_a)
        with freeze_time('2026-03-04 09:00:00'):
            doc.action_timer_start()
        with freeze_time('2026-03-04 09:00:02'):
            doc.action_timer_pause()
        with freeze_time('2026-03-04 09:00:05'):
            doc.action_timer_pause()
            self.assertEqual(self.timer_of(self.doc_a, self.u1).timer_pause, _dt('09:00:02'))
        with freeze_time('2026-03-04 09:01:00'):
            self.assertAlmostEqual(doc.action_timer_stop(), 2 / 60)
        doc = self.as_(self.doc_b)
        with freeze_time('2026-03-04 09:00:00'):
            doc.action_timer_start()
        with freeze_time('2026-03-04 09:00:02'):
            doc.action_timer_pause()
        with freeze_time('2026-03-04 09:00:05'):
            doc.action_timer_pause()
        with freeze_time('2026-03-04 09:00:10'):
            doc.action_timer_resume()
        self.assertEqual(self.timer_of(self.doc_b, self.u1).timer_start, _dt('09:00:08'))

    def test_A14_whole_second_timestamps(self):
        with freeze_time('2026-03-04 10:00:00.700000'):
            self.as_(self.doc_a).action_timer_start()
        self.assertEqual(self.timer_of(self.doc_a, self.u1).timer_start, _dt('10:00:00'))

    def test_A22_mirrored_fields_without_timer(self):
        doc = self.as_(self.doc_a)
        self.assertFalse(doc.timer_start)
        self.assertFalse(doc.timer_pause)
        self.assertIs(doc.is_timer_running, False)
        self.assertFalse(doc.user_timer_id)

    def test_A23_freshness_after_create(self):
        doc = self.as_(self.doc_a)
        self.assertFalse(doc.user_timer_id)
        doc.action_timer_start()
        self.assertEqual(doc.user_timer_id, self.timer_of(self.doc_a, self.u1))
        self.assertTrue(doc.is_timer_running)

    def test_A26_start_stop_need_one_record(self):
        both = self.as_(self.doc_a | self.doc_b)
        with self.assertRaises(ValueError):
            both.action_timer_start()
        self.assertFalse(self.env['timer.timer'].sudo().search([('user_id', '=', self.u1.id)]))
        self.as_(self.doc_a).action_timer_start()
        fields_ = ['timer_start', 'timer_pause']
        before = self.timer_of(self.doc_a, self.u1).read(fields_)
        with self.assertRaises(ValueError):
            both.action_timer_stop()
        self.assertEqual(self.timer_of(self.doc_a, self.u1).read(fields_), before)
        self.assertFalse(self.timer_of(self.doc_b, self.u1))

    def test_A28_restart_on_stop_interrupt_document(self):
        with freeze_time('2026-03-04 09:00:00'):
            self.as_(self.doc_i).action_timer_start()
        with freeze_time('2026-03-04 09:10:00'):
            self.as_(self.doc_i).action_timer_start()
        timer = self.timer_of(self.doc_i, self.u1)
        self.assertEqual(len(timer), 1)
        self.assertEqual(timer.timer_start, _dt('09:10:00'))
        self.assertFalse(timer.timer_pause)

    def test_A29_never_started_timer(self):
        timer = self._direct(self.doc_a)
        self.assertIs(self.as_(self.doc_a).action_timer_stop(), False)
        self.assertFalse(timer.exists())
        timer = self._direct(self.doc_a)
        self.as_(self.doc_a).action_timer_pause()
        self.assertFalse(timer.timer_start or timer.timer_pause)
        with freeze_time('2026-03-04 09:00:00'):
            self.as_(self.doc_a).action_timer_start()
        self.assertEqual(timer.timer_start, _dt('09:00:00'))

    def test_A30_resume_on_running_timer(self):
        self._direct(self.doc_a, timer_start=_dt('09:00:00'))
        with freeze_time('2026-03-04 09:00:30'):
            self.as_(self.doc_a).action_timer_resume()
        timer = self.timer_of(self.doc_a, self.u1)
        self.assertTrue(timer.is_timer_running)
        self.assertLessEqual(timer.timer_start - _dt('09:00:00'), timedelta(seconds=1))
