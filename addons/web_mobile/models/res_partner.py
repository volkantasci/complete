# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import fields, models


class CwmPartner(models.Model):
    _inherit = 'res.partner'

    image_medium = fields.Image(
        string='Medium-sized image',
        compute='_cwm_fill_medium_picture',
        readonly=True,
    )

    def _cwm_fill_medium_picture(self):
        for partner in self:
            partner.image_medium = partner.avatar_128
