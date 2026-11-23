# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import api, models
from odoo.fields import Domain


class HrLeaveReportCalendar(models.Model):
    _name = 'hr.leave.report.calendar'
    _inherit = ['hr.leave.report.calendar', 'hhg.gantt.rows']

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
        """The Gantt data of the report view: same rows and pill text as the request's."""
        scaled = self._hhg_scaled(start_date, stop_date, scale)
        arguments = (
            domain, groupby, read_specification, limit, offset,
            unavailability_fields, progress_bar_fields, start_date, stop_date, scale)
        # R7, R21: the sample mode is 002a's own (the view's first load, with no request on the
        # first page in the opening period under the search): the answer carries no flag of it
        if scaled._hhg_every_employee(groupby):
            return scaled._get_gantt_data_with_empty(*arguments)
        return super(HrLeaveReportCalendar, scaled).get_gantt_data(*arguments)

    @api.model
    def _hrg_relation_leaf(self, condition, field_name):
        """The report's job position and company are the employee's own (R13 point 3).

        The department is a column of the report, copied from the request: a condition on it
        stays a condition on the report, so it is left out of the conversion.
        """
        head = condition.field_expr.partition('.')[0]
        if field_name == 'employee_id' and head in ('job_id', 'company_id'):
            return Domain(condition.field_expr, condition.operator, condition.value)
        return super()._hrg_relation_leaf(condition, field_name)
