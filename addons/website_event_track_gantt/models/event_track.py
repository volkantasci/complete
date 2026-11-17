# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

from odoo import models


class EventTrack(models.Model):
    _inherit = 'event.track'

    def action_unschedule(self):
        """Take the track off the schedule; its duration is kept."""
        self.ensure_one()
        self.write({'date': False, 'date_end': False})
        return {'type': 'ir.actions.act_window_close'}
