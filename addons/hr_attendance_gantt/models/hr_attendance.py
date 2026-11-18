# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.tools.date_utils import sum_intervals


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
    def _hag_without_contract(self, staff_ids, start, stop):
        """The employees among ``staff_ids`` with no contract version in the period (R19).

        The period is ``start`` (included) to ``stop`` (excluded), both naive UTC; its days
        are read in the user's time zone. Versions are read with the rights of the system
        (R22).
        """
        if not staff_ids or not start or not stop:
            return []
        zone = ZoneInfo(self.env.context.get('tz') or self.env.user.tz or 'UTC')

        def local(moment):
            return moment.replace(tzinfo=UTC).astimezone(zone)

        first_day = local(start).date()
        after_last_day = (local(stop) - timedelta(microseconds=1)).date() + timedelta(days=1)
        versions = self.env['hr.version'].sudo().search([
            ('employee_id', 'in', staff_ids),
            ('contract_date_start', '!=', False),
            ('contract_date_start', '<', after_last_day),
            '|', ('contract_date_end', '=', False), ('contract_date_end', '>=', first_day),
        ])
        covered = set(versions.employee_id.ids)
        return [employee for employee in staff_ids if employee not in covered]

    @api.model
    def _gantt_unavailability(self, group_field, record_ids, period_start, period_stop, scale_name):
        """The unavailable periods of the employee rows (R15).

        The Community's per-employee intervals are used: they read each contract period's
        schedule in the employee's time zone and place the hours at the same clock time
        in the user's. They are computed with the rights of the system (R22), two days more
        on each side of the period (a shift between time zones can exceed a day) so that a
        shift of the clock hours across the period's edge is not lost, then cut to the period.
        Other fields get the base answer.
        """
        if group_field != 'employee_id':
            return super()._gantt_unavailability(
                group_field, record_ids, period_start, period_stop, scale_name)
        if not record_ids or not period_start or not period_stop:
            return {}
        margin = timedelta(days=2)
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

    @api.model
    def _gantt_progress_bar(self, group_field, record_ids, period_start, period_stop):
        """Hours worked and hours expected of the employee rows (R16, R18, R22).

        Returns ``{employee id: {'value', 'max_value', 'hag_fully_flexible', 'hag_tracked'}}``.
        The value counts only the attendances the user may read (no sudo); the maximum and
        the flags read schedules and contracts with the rights of the system. Only internal
        users get values; any other field than the employee is refused (E10).
        """
        if not self.env.user._is_internal():
            return {}
        if group_field != 'employee_id':
            raise UserError(self.env._(
                "Progress bars are only available for the employee field of attendances."))
        if not record_ids or not period_start or not period_stop:
            return {}
        start = fields.Datetime.to_datetime(period_start)
        stop = fields.Datetime.to_datetime(period_stop)
        worked = self._hag_hours_worked(record_ids, start, stop)
        zone = ZoneInfo(self.env.context.get('tz') or self.env.user.tz or 'UTC')
        first_day = start.replace(tzinfo=UTC).astimezone(zone).date()
        after_last_day = (
            (stop - timedelta(microseconds=1)).replace(tzinfo=UTC).astimezone(zone).date()
            + timedelta(days=1))
        employees = self.env['hr.employee'].sudo().with_context(active_test=False)
        result = {}
        for employee in employees.browse(record_ids):
            maximum, fully_flexible = self._hag_hours_expected(
                employee, first_day, after_last_day, zone)
            result[employee.id] = {
                'value': worked.get(employee.id, 0.0),
                'max_value': maximum,
                'hag_fully_flexible': fully_flexible,
                'hag_tracked': bool(employee.attendance_based),
            }
        return result

    @api.model
    def _hag_hours_worked(self, staff_ids, start, stop):
        """D2: hours of each employee's closed attendances inside ``[start, stop]`` (naive UTC).

        An attendance inside counts with its stored worked hours; one that crosses a bound
        counts with its part's length less the part's share of its break. Only attendances
        the user may read are seen.
        """
        attendances = self.search([
            ('employee_id', 'in', staff_ids),
            ('check_out', '!=', False),
            ('check_in', '<', stop),
            ('check_out', '>', start),
        ])
        worked = {}
        for attendance in attendances:
            check_in, check_out = attendance.check_in, attendance.check_out
            if check_in >= start and check_out <= stop:
                hours = attendance.worked_hours
            else:
                length = (check_out - check_in).total_seconds() / 3600
                part = (min(check_out, stop) - max(check_in, start)).total_seconds() / 3600
                hours = part * (1 - attendance.break_duration / length) if length else 0.0
            employee_id = attendance.employee_id.id
            worked[employee_id] = worked.get(employee_id, 0.0) + hours
        return worked

    @api.model
    def _hag_hours_expected(self, employee, first_day, after_last_day, zone):
        """The hours expected of a (sudo) employee over whole days of the user's zone (R16 point 2).

        Returns ``(hours, fully flexible)``. The schedule at the period's start decides the
        kind: fully flexible gives 0, flexible the weekly formula, any other the Community's
        expected attendances of each contract period (company-wide leaves taken off).
        """
        overlapping = employee._get_versions_with_contract_overlap_with_period(
            first_day, after_last_day - timedelta(days=1))
        calendar = overlapping[:1].resource_calendar_id or employee.resource_calendar_id
        if calendar._is_fully_flexible():
            return 0.0, True
        if calendar._is_flexible():
            days = (after_last_day - first_day).days
            weeks, rest = divmod(days, 7)
            per_week = calendar.hours_per_week
            return weeks * per_week + min(rest * calendar.hours_per_day, per_week), False
        date_from = datetime.combine(first_day, time.min, zone)
        date_to = datetime.combine(after_last_day, time.min, zone)
        if overlapping:
            intervals = employee._get_expected_attendances(date_from, date_to)
        else:
            # No contract in the period's own days: the current schedule over the whole
            # period. The Community's method looks at the day of ``date_to`` too, where a
            # contract may start, so the fallback is worked out here, as the Community does.
            intervals = employee.resource_calendar_id._work_intervals_batch(
                date_from, date_to,
                resources_per_tz=employee._get_resources_per_tz(date_from),
                compute_leaves=True,
                domain=[('company_id', 'in', [False, employee.company_id.id]),
                        ('count_as', '=', 'absence')],
            )[employee.resource_id.id]
        return sum_intervals(intervals), False
