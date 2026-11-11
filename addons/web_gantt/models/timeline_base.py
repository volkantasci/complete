# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from lxml import etree
from odoo import _, api, models
from odoo.exceptions import UserError

_TL_START_CANDIDATES = ('date_start', 'start_date', 'x_date_start', 'x_start_date')
_TL_STOP_CANDIDATES = (
    'date_stop', 'stop_date', 'date_end', 'end_date',
    'x_date_stop', 'x_stop_date', 'x_date_end', 'x_end_date',
)


class Base(models.AbstractModel):
    _inherit = 'base'

    _start_name = 'date_start'
    _stop_name = 'date_stop'

    @api.model
    def _tl_pick_field(self, declared, candidates):
        for name in (declared, *candidates):
            if name in self._fields:
                return name
        return None

    @api.model
    def _get_default_gantt_view(self):
        start = self._tl_pick_field(self._start_name, _TL_START_CANDIDATES)
        stop = self._tl_pick_field(self._stop_name, _TL_STOP_CANDIDATES)
        if not start or not stop:
            raise UserError(_(
                "Model %s has no pair of start and stop date fields, "
                "so no Gantt view can be built for it.",
                self._name,
            ))
        root = etree.Element('gantt')
        root.set('string', self._description)
        root.set('date_start', start)
        root.set('date_stop', stop)
        return root

    @api.model
    def _get_view_fields(self, view_type, models):
        models = super()._get_view_fields(view_type, models)
        if view_type == 'gantt':
            # pills can be labelled, coloured and decorated by any field
            wanted = set(models.get(self._name, ())) | set(self._fields)
            models[self._name] = wanted
        return models
