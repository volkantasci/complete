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
        if scaled._hhg_every_employee(groupby):
            result = scaled._get_gantt_data_with_empty(*arguments)
        else:
            result = super(HrLeaveReportCalendar, scaled).get_gantt_data(*arguments)
        # R7, R21: the sample data show only when the user can see no report record at all, the
        # period and the search ignored (the user's own rights apply, the action's domain does not)
        result['hhg_report_empty'] = not scaled.search_count([], limit=1)
        return result

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
