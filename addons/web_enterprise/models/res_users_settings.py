# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import api, fields, models


class ResUsersSettings(models.Model):
    _inherit = 'res.users.settings'

    homemenu_config = fields.Json(
        readonly=True,
        string="Home Menu Configuration",
    )
    color_scheme = fields.Selection(
        [('system', "System"), ('light', "Light"), ('dark', "Dark")],
        string="Color Scheme",
        required=True,
        default='system',
    )

    @api.model_create_multi
    def create(self, vals_list):
        # An empty colour scheme means "keep the default", never "clear it".
        vals_list = [
            {key: value for key, value in vals.items() if key != 'color_scheme' or value}
            for vals in vals_list
        ]
        return super().create(vals_list)

    def write(self, vals):
        if 'color_scheme' in vals and not vals['color_scheme']:
            vals = {key: value for key, value in vals.items() if key != 'color_scheme'}
        return super().write(vals)
