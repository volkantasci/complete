# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import timedelta

from odoo import fields
from odoo.tests import HttpCase, tagged


@tagged('post_install', '-at_install')
class TestTimerTours(HttpCase):
    """Browser tours on the observation screens of `timer.test`."""

    def _url(self, record=None):
        url = '/odoo/action-test_timer.action_timer_test'
        return f'{url}/{record.id}' if record else url

    def test_U1_U2_U3_form_start_pause_resume_stop(self):
        record = self.env['timer.test'].create({'name': 'Tour form', 'hours_logged': 1.5})
        self.start_tour(self._url(record), 'timer_form_start_pause_resume_stop', login='admin')
        self.assertFalse(record.with_user(self.env.ref('base.user_admin')).user_timer_id)

    def test_U5_list_and_form_stay_responsive(self):
        admin = self.env.ref('base.user_admin')
        record_a, record_b = self.env['timer.test'].create([
            {'name': 'Tour paused A'},
            {'name': 'Tour running B', 'hours_logged': 1.5},
        ])
        now = fields.Datetime.now()
        self.env['timer.timer'].sudo().create([
            {
                'res_model': 'timer.test', 'res_id': record_a.id, 'user_id': admin.id,
                'timer_start': now - timedelta(hours=2), 'timer_pause': now - timedelta(hours=1),
            },
            {
                'res_model': 'timer.test', 'res_id': record_b.id, 'user_id': admin.id,
                'timer_start': now - timedelta(minutes=25),
            },
        ])
        self.start_tour(self._url(), 'timer_list_and_form_responsive', login='admin')

    def test_U8_U9_toggle_starts_and_stops(self):
        self.env['timer.test'].create({'name': 'Tour toggle'})
        self.start_tour(self._url(), 'timer_toggle_starts_and_stops', login='admin')
