# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

from datetime import timedelta

from odoo import api, fields, models


class EventEvent(models.Model):
    _inherit = 'event.event'

    track_plan_start = fields.Datetime(
        string='Tracks View Start',
        compute='_compute_track_plan',
        store=False,
    )
    track_plan_scale = fields.Selection(
        [('day', 'Day'), ('week', 'Week'), ('month', 'Month'), ('year', 'Year')],
        string='Tracks View Range',
        compute='_compute_track_plan',
        store=False,
    )

    @api.depends(
        'date_begin', 'date_end', 'track_ids.date', 'track_ids.date_end', 'track_ids.active'
    )
    def _compute_track_plan(self):
        for event in self:
            event.track_plan_start = False
            event.track_plan_scale = False
            if not (event.date_begin and event.date_end):
                continue
            tracks = event.track_ids.filtered('active')
            first = min([event.date_begin, *tracks.filtered('date').mapped('date')])
            last = max([event.date_end, *tracks.filtered('date_end').mapped('date_end')])
            span = last - first
            if span > timedelta(days=30):
                scale = 'year'
            elif span > timedelta(days=7):
                scale = 'month'
            elif span > timedelta(days=1):
                scale = 'week'
            else:
                scale = 'day'
            event.track_plan_start = first
            event.track_plan_scale = scale
