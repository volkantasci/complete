# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from lxml import etree
from odoo import _, api, fields, models
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

    @api.model
    @api.readonly
    def get_gantt_data(
        self, domain, groupby, read_specification, limit=None, offset=0,
        unavailability_fields=None, progress_bar_fields=None,
        start_date=None, stop_date=None, scale=None,
    ):
        """Groups, records and host answers needed to draw one page of a Gantt view."""
        groupby = list(groupby or [])
        if groupby:
            ordered = self.with_context(read_group_expand=True)
            groups, length = ordered._formatted_read_group_with_length(
                domain, groupby, ['id:array_agg'], offset=offset or 0, limit=limit)
        else:
            groups = [{'id:array_agg': self.search(domain).ids}]
            length = 1
        all_ids = {rid for group in groups for rid in group['id:array_agg']}
        records = self.with_context(active_test=False).search([('id', 'in', list(all_ids))])
        position = {rid: index for index, rid in enumerate(records.ids)}
        for group in groups:
            group['__record_ids'] = sorted(group.pop('id:array_agg'), key=position.__getitem__)
            group.pop('__extra_domain', None)
            group.pop('__fold', None)
        start = fields.Datetime.to_datetime(start_date)
        stop = fields.Datetime.to_datetime(stop_date)
        unavailabilities = {
            name: self._gantt_unavailability(
                name, self._tl_group_value_ids(groups, name), start, stop, scale)
            for name in unavailability_fields or ()
        }
        progress_bars = {
            name: self._gantt_progress_bar(
                name, self._tl_group_value_ids(groups, name), start, stop)
            for name in progress_bar_fields or ()
        }
        return {
            'groups': groups,
            'records': records.web_read(read_specification),
            'length': length,
            'unavailabilities': unavailabilities,
            'progress_bars': progress_bars,
        }

    @api.model
    def _tl_group_value_ids(self, groups, field_name):
        found = set()
        for group in groups:
            value = group.get(field_name)
            if value:
                found.add(value[0] if isinstance(value, (list, tuple)) else value)
        return sorted(found)

    @api.model
    def _gantt_unavailability(self, field, res_ids, start, stop, scale):
        """Unavailable periods per value of ``field``; hosts override this."""
        return {}

    @api.model
    def _gantt_progress_bar(self, field, res_ids, start, stop):
        """Progress values per value of ``field``; hosts override this."""
        return {}
