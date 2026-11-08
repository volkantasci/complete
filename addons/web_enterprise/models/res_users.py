# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    color_scheme = fields.Selection(
        related='res_users_settings_id.color_scheme',
        string="Color Scheme",
        readonly=False,
        user_writeable=True,
    )

    def write(self, vals):
        if 'color_scheme' in vals:
            # a user without a settings record would lose the edit (related field write)
            settings = self.env['res.users.settings']
            for user in self:
                settings._find_or_create_for_user(user)
        return super().write(vals)
