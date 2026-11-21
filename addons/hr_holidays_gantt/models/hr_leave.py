# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import api, models


class HrLeave(models.Model):
    _name = 'hr.leave'
    _inherit = ['hr.leave', 'hhg.gantt.rows']

    @api.model
    @api.readonly
    def get_gantt_data(
        self,
        domain,
        groupby,
        read_specification,
        limit=None,
        offset=0,
        unavailability_fields=None,
        progress_bar_fields=None,
        start_date=None,
        stop_date=None,
        scale=None,
    ):
        """The Gantt data of the leave view: rows of R13, pill text of R10 (decision D1)."""
        scaled = self._hhg_scaled(start_date, stop_date, scale)
        arguments = (
            domain, groupby, read_specification, limit, offset,
            unavailability_fields, progress_bar_fields, start_date, stop_date, scale)
        if scaled._hhg_every_employee(groupby):
            return scaled._get_gantt_data_with_empty(*arguments)
        return super(HrLeave, scaled).get_gantt_data(*arguments)
