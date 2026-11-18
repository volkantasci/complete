# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from odoo import api, fields, models


class HrAttendance(models.Model):
    _inherit = 'hr.attendance'

    @api.model
    @api.readonly
    def get_gantt_data(
        self, domain, groupby, read_specification, limit=None, offset=0,
        unavailability_fields=None, progress_bar_fields=None,
        start_date=None, stop_date=None, scale=None,
    ):
        """The Gantt data of the attendance view (rows of R14, no-contract list of R19).

        The records shown (R13) are the ones ``domain`` selects: the browser builds the
        period condition, because only it knows "now".
        """
        groupby = list(groupby or [])
        arguments = (
            domain, groupby, read_specification, limit, offset,
            unavailability_fields, progress_bar_fields, start_date, stop_date, scale)
        by_employee = groupby == ['employee_id']
        user_domain = self.env.context.get('user_domain') or []
        if by_employee and self._hrg_concerns_only(user_domain, 'employee_id'):
            result = self._get_gantt_data_with_empty(*arguments)
        else:
            result = super().get_gantt_data(*arguments)
        if by_employee and result['groups']:
            result['hag_without_contract'] = self._hag_without_contract(
                self._tl_group_value_ids(result['groups'], 'employee_id'),
                fields.Datetime.to_datetime(start_date), fields.Datetime.to_datetime(stop_date))
        return result

    @api.model
    def _hag_without_contract(self, employee_ids, start, stop):
        """The employees among ``employee_ids`` with no contract version in the period (R19).

        The period is ``start`` (included) to ``stop`` (excluded), both naive UTC; its days
        are read in the user's time zone. Versions are read with the rights of the system
        (R22).
        """
        if not employee_ids or not start or not stop:
            return []
        zone = ZoneInfo(self.env.context.get('tz') or self.env.user.tz or 'UTC')

        def local(moment):
            return moment.replace(tzinfo=UTC).astimezone(zone)

        first_day = local(start).date()
        after_last_day = (local(stop) - timedelta(microseconds=1)).date() + timedelta(days=1)
        versions = self.env['hr.version'].sudo().search([
            ('employee_id', 'in', employee_ids),
            ('contract_date_start', '!=', False),
            ('contract_date_start', '<', after_last_day),
            '|', ('contract_date_end', '=', False), ('contract_date_end', '>=', first_day),
        ])
        covered = set(versions.employee_id.ids)
        return [employee for employee in employee_ids if employee not in covered]

    @api.model
    def _gantt_unavailability(self, group_field, record_ids, period_start, period_stop, scale_name):
        """The unavailable periods of the employee rows (R15).

        The Community's per-employee intervals are used: they read each contract period's
        schedule in the employee's time zone and place the hours at the same clock time
        in the user's. They are computed with the rights of the system (R22), a day more
        on each side of the period so that a shift of the clock hours across the period's
        edge is not lost, then cut to the period. Other fields get the base answer.
        """
        if group_field != 'employee_id':
            return super()._gantt_unavailability(
                group_field, record_ids, period_start, period_stop, scale_name)
        if not record_ids or not period_start or not period_stop:
            return {}
        margin = timedelta(days=1)
        start = fields.Datetime.to_datetime(period_start).replace(tzinfo=UTC)
        stop = fields.Datetime.to_datetime(period_stop).replace(tzinfo=UTC)
        employees = self.env['hr.employee'].sudo().with_context(active_test=False)
        employees = employees.browse(record_ids)
        wide = employees._get_employee_unavailable_intervals(start - margin, stop + margin)
        result = {}
        for employee_id in record_ids:
            cut = []
            for interval in wide.get(employee_id, []):
                begin, end = max(interval['start'], start), min(interval['stop'], stop)
                if begin < end:
                    cut.append({'start': self._hag_naive(begin), 'stop': self._hag_naive(end)})
            result[employee_id] = cut
        return result

    @staticmethod
    def _hag_naive(moment: datetime) -> datetime:
        return moment.astimezone(UTC).replace(tzinfo=None)
