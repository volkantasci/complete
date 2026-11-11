# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import api, fields, models


class IrUiView(models.Model):
    _inherit = 'ir.ui.view'

    type = fields.Selection(selection_add=[('gantt', "Gantt")])

    def _is_qweb_based_view(self, view_type):
        return super()._is_qweb_based_view(view_type) or view_type == 'gantt'

    def _get_view_info(self):
        return {'gantt': {'icon': 'view_timeline'}} | super()._get_view_info()

    @api.model
    def _get_view_fields(self, view_type, models):
        models = super()._get_view_fields(view_type, models)
        if view_type == 'gantt':
            # pills can be labelled, coloured and decorated by any field
            wanted = set(models.get(self._name, ())) | set(self.env[self._name]._fields)
            models[self._name] = wanted
        return models
