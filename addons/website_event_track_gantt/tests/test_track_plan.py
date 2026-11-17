# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime

from odoo import fields
from odoo.tests.common import TransactionCase

from .track_fixtures import make_gantt_summit, make_tz_events


class TestTrackPlan(TransactionCase):
    def _event(self, begin, end, name='Plan Event'):
        return self.env['event.event'].create({'name': name, 'date_begin': begin, 'date_end': end})

    def _track(self, event, start, **kw):
        return self.env['event.track'].create({
            'name': 'Plan Track', 'event_id': event.id, 'date': start, 'duration': 2.0, **kw})

    def test_a32_range_thresholds(self):
        start = datetime(2030, 7, 1, 8, 0)
        cases = [
            (datetime(2030, 7, 2, 8, 0), 'day'),
            (datetime(2030, 7, 2, 8, 0, 1), 'week'),
            (datetime(2030, 7, 8, 8, 0), 'week'),
            (datetime(2030, 7, 8, 8, 1), 'month'),
            (datetime(2030, 7, 31, 8, 0), 'month'),
            (datetime(2030, 7, 31, 9, 0), 'year'),
        ]
        for end, scale in cases:
            with self.subTest(end=end):
                event = self._event(start, end)
                self.assertEqual(event.track_plan_scale, scale)
                self.assertEqual(event.track_plan_start, start)

    def test_a33_tracks_outside_the_event(self):
        event = self._event(datetime(2030, 7, 10, 8, 0), datetime(2030, 7, 10, 12, 0))
        early = self._track(event, datetime(2030, 7, 5, 9, 0))
        self.assertEqual(event.track_plan_start, datetime(2030, 7, 5, 9, 0))
        self.assertEqual(event.track_plan_scale, 'week')
        early.unlink()
        self._track(event, datetime(2030, 7, 20, 9, 0))
        self.assertEqual(event.track_plan_start, datetime(2030, 7, 10, 8, 0))
        self.assertEqual(event.track_plan_scale, 'month')

        event = self._event(datetime(2030, 7, 10, 8, 0), datetime(2030, 7, 10, 12, 0), 'Plan B')
        self._track(event, False)
        self.assertEqual(event.track_plan_start, datetime(2030, 7, 10, 8, 0))
        self.assertEqual(event.track_plan_scale, 'day')
        self._track(event, datetime(2030, 7, 5, 9, 0), active=False)
        self.assertEqual(event.track_plan_start, datetime(2030, 7, 10, 8, 0))
        self.assertEqual(event.track_plan_scale, 'day')

    def test_a35_values_follow_changes(self):
        summit = make_gantt_summit(self.env)
        event, tracks = summit['event'], summit['tracks']
        self.assertEqual(event.track_plan_scale, 'week')
        self.assertEqual(event.track_plan_start, datetime(2030, 6, 10, 6, 0))
        tracks['Closing Words'].date = datetime(2030, 6, 20, 13, 0)
        self.assertEqual(event.track_plan_scale, 'month')
        self.assertEqual(event.track_plan_start, datetime(2030, 6, 10, 6, 0))
        tracks['Opening Keynote'].date = datetime(2030, 6, 9, 23, 0)
        self.assertEqual(event.track_plan_start, datetime(2030, 6, 9, 23, 0))
        event_fields = self.env['event.event']._fields
        self.assertFalse(event_fields['track_plan_start'].store)
        self.assertFalse(event_fields['track_plan_scale'].store)

    def test_a57_value_passed_by_the_button(self):
        east = make_tz_events(self.env)['TZ east']
        self.assertEqual(fields.Datetime.to_string(east.track_plan_start), '2030-07-01 22:30:00')
        self.assertEqual(east.track_plan_scale, 'day')
        summit = make_gantt_summit(self.env)['event']
        self.assertEqual(fields.Datetime.to_string(summit.track_plan_start), '2030-06-10 06:00:00')
        self.assertEqual(summit.track_plan_scale, 'week')
