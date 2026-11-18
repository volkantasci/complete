# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import UTC, timedelta
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
