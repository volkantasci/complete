# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase

from .track_fixtures import make_gantt_summit


class TestUnschedule(TransactionCase):
    def test_a45_unschedule(self):
        tracks = make_gantt_summit(self.env)['tracks']
        panel = tracks['Panel Talk']
        result = panel.action_unschedule()
        self.assertEqual(result, {'type': 'ir.actions.act_window_close'})
        self.assertFalse(panel.date)
        self.assertFalse(panel.date_end)
        self.assertEqual(panel.duration, 4.0)
        panel.invalidate_recordset()
        self.assertFalse(panel.date)
        self.assertEqual(panel.duration, 4.0)
        with self.assertRaises(ValueError):
            (tracks['Wood Joinery'] | tracks['Closing Words']).action_unschedule()
