# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import UTC, timedelta

from odoo import api, fields, models
from odoo.exceptions import UserError


class HhgGanttRows(models.AbstractModel):
    """What the data call of the time-off requests and of the report have in common."""

    _name = 'hhg.gantt.rows'
    _description = 'Time Off Gantt Rows'

    @api.model
    def _hhg_scaled(self, start_date, stop_date, scale):
        """The model with the displayed scale in its context (decision D1).

        Both paths of the call read their records with it, so the pill's text follows the
        scale whatever the search holds. A call without its period is refused.
        """
        if not start_date or not stop_date:
            raise UserError(self.env._("The data call needs the period it is made for."))
        return self.with_context(scale=scale)

    @api.model
    def _hhg_every_employee(self, groupby):
        """Whether employees without requests get rows (R13 point 1).

        The view is grouped by the employee alone and every condition of the user's own search,
        as the client sent it, is about the employee.
        """
        user_domain = self.env.context.get('user_domain') or []
        return list(groupby or []) == ['employee_id'] and self._hrg_concerns_only(
            user_domain, 'employee_id')

    @api.model
    def _gantt_unavailability(self, group_field, record_ids, period_start, period_stop, scale_name):
        """The unavailable periods of the employee rows (R14); other fields get the base answer.

        The Community's per-employee intervals are read with the rights of the system, in the
        browser's time zone (``tz`` of the context, else the user's): the schedule's hours land
        at the same clock time there. They are asked two days wider on each side, then cut to
        the period, so a shift of the clock hours across its edge is not lost. Naive UTC.
        """
        if group_field != 'employee_id':
            return super()._gantt_unavailability(
                group_field, record_ids, period_start, period_stop, scale_name)
        if not record_ids or not period_start or not period_stop:
            return {}
        zone = self.env.context.get('tz') or self.env.user.tz or 'UTC'
        margin = timedelta(days=2)
        start = fields.Datetime.to_datetime(period_start).replace(tzinfo=UTC)
        stop = fields.Datetime.to_datetime(period_stop).replace(tzinfo=UTC)
        employees = self.env['hr.employee'].sudo().with_context(active_test=False, tz=zone)
        wide = employees.browse(record_ids)._get_employee_unavailable_intervals(
            start - margin, stop + margin)
        result = {}
        for employee_id in record_ids:
            cut = []
            for interval in wide.get(employee_id, []):
                begin, end = max(interval['start'], start), min(interval['stop'], stop)
                if begin < end:
                    cut.append({
                        'start': begin.astimezone(UTC).replace(tzinfo=None),
                        'stop': end.astimezone(UTC).replace(tzinfo=None),
                    })
            result[employee_id] = cut
        return result
