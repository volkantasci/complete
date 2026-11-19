# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError
from odoo.fields import Domain
from odoo.tools.date_utils import sum_intervals
from odoo.tools.intervals import Intervals


class HrAttendance(models.Model):
    _inherit = 'hr.attendance'

    has_active_contract = fields.Boolean(
        string="Has Active Contract",
        compute='_compute_has_active_contract', search='_search_has_active_contract',
        groups='hr_attendance.group_hr_attendance_officer')

    @api.depends()
    def _compute_has_active_contract(self):
        # a search field: it has no value of its own to read
        self.has_active_contract = False

    show_contract_warning = fields.Boolean(
        string="Show Contract Warning", compute='_compute_show_contract_warning',
        compute_sudo=True)

    @api.depends('employee_id', 'date')
    def _compute_show_contract_warning(self):
        """R7: the employee has no active contract on the attendance's date.

        ``date`` is the Community's (the check-in's day in the employee's time zone, today while
        the check-in is empty). The versions are read with the rights of the system, so a user
        who may not read contracts gets the value too.
        """
        versions = self.env['hr.version'].sudo()
        for attendance in self:
            employee, day = attendance.employee_id, attendance.date
            if not employee or not day:
                attendance.show_contract_warning = False
                continue
            attendance.show_contract_warning = not versions.search_count([
                ('employee_id', '=', employee._origin.id or employee.id),
                ('contract_date_start', '!=', False),
                ('contract_date_start', '<=', day),
                '|', ('contract_date_end', '=', False), ('contract_date_end', '>=', day),
            ], limit=1)

    @api.model
    def _hag_today(self):
        """The calendar date now, in the time zone sent with the call (else the user's)."""
        zone = ZoneInfo(self.env.context.get('tz') or self.env.user.tz or 'UTC')
        return fields.Datetime.now().replace(tzinfo=UTC).astimezone(zone).date()

    @api.model
    def _hag_active_contract_employees(self):
        """The ids of the employees with an active contract today (R6 point 2).

        An active, not archived version whose contract starts before tomorrow and ends on or
        after today, or never. The versions are read with the rights of the system (R6 point 3).
        """
        today = self._hag_today()
        versions = self.env['hr.version'].sudo().search([
            ('employee_id', '!=', False),
            ('contract_date_start', '!=', False),
            ('contract_date_start', '<', today + timedelta(days=1)),
            '|', ('contract_date_end', '=', False), ('contract_date_end', '>=', today),
        ])
        return versions.employee_id.ids

    @api.model
    def _hag_contract_wanted(self, operator, value):
        """The set of values (with a contract: True, without: False) a search keeps."""
        if operator in ('=', '!='):
            wanted = {bool(value)} if operator == '=' else {not value}
        elif operator in ('in', 'not in'):
            wanted = {bool(item) for item in value}
            if operator == 'not in':
                wanted = {True, False} - wanted
        else:
            raise UserError(self.env._("This search is not supported for the contract filter."))
        return wanted

    @api.model
    def _hag_contract_condition(self, field_name, operator, value):
        """The condition on ``field_name`` (``id`` or ``employee_id``) that a search on the
        contract field stands for."""
        wanted = self._hag_contract_wanted(operator, value)
        if wanted == {True, False}:
            return Domain.TRUE
        if not wanted:
            return Domain.FALSE
        return Domain(
            field_name, 'in' if True in wanted else 'not in', self._hag_active_contract_employees())

    @api.model
    def _search_has_active_contract(self, operator, value):
        return self._hag_contract_condition('employee_id', operator, value)

    @api.model
    def _hrg_relation_leaf(self, condition, field_name):
        """The contract condition is a condition on the employee (R6 point 4)."""
        if field_name == 'employee_id' and condition.field_expr == 'has_active_contract':
            if not self.env.user.has_group('hr_attendance.group_hr_attendance_officer'):
                raise AccessError(self.env._("You are not allowed to search by contract."))
            return self._hag_contract_condition('id', condition.operator, condition.value)
        return super()._hrg_relation_leaf(condition, field_name)

    def action_open_details(self):
        """The window action that opens this attendance in the Community form.

        Kept for modules that call it on one attendance; no screen of this module uses it.
        """
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': self.env._("Attendance"),
            'res_model': 'hr.attendance',
            'res_id': self.id,
            'view_mode': 'form',
            'views': [(self.env.ref('hr_attendance.hr_attendance_view_form').id, 'form')],
            'target': 'current',
        }

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
        if not start_date or not stop_date:
            raise UserError(self.env._("The data call needs the period it is made for."))
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

        The period is ``start`` (included) to ``stop`` (excluded), both naive UTC. A version
        overlaps it when its contract starts before the calendar date of ``stop`` and ends
        on or after the calendar date of ``start``, both dates read in the user's time zone.
        Versions are read with the rights of the system (R22).
        """
        if not start or not stop:
            raise UserError(self.env._("The data call needs the period it is made for."))
        if not staff_ids:
            return []
        zone = ZoneInfo(self.env.context.get('tz') or self.env.user.tz or 'UTC')
        first_day = start.replace(tzinfo=UTC).astimezone(zone).date()
        end_day = stop.replace(tzinfo=UTC).astimezone(zone).date()
        versions = self.env['hr.version'].sudo().search([
            ('employee_id', 'in', staff_ids),
            ('contract_date_start', '!=', False),
            ('contract_date_start', '<', end_day),
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
        employees = self.env['hr.employee'].sudo().with_context(active_test=False)
        result = {}
        for employee in employees.browse(record_ids):
            result[employee.id] = {
                'value': worked.get(employee.id, 0.0),
                'max_value': self._hag_hours_expected(employee, start, stop, zone),
                'hag_fully_flexible': employee.resource_calendar_id._is_fully_flexible(),
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
    def _hag_hours_expected(self, employee, start, stop, zone):
        """The hours expected of a (sudo) employee between two instants (R16 point 2, D5).

        ``start`` and ``stop`` are the bounds the browser sent (naive UTC): the midnights
        that bound the period's own days, which are read in ``zone`` (the user's). The
        schedule at the period's start is the one of the version in effect on the first
        day: flexible gives the weekly formula (0 for a fully flexible one), any other the
        Community's expected attendances, with only the contract periods that overlap
        those days and the company-wide leaves taken off.
        """
        date_from = start.replace(tzinfo=UTC).astimezone(zone)
        date_to = stop.replace(tzinfo=UTC).astimezone(zone)
        first_day = date_from.date()
        last_day = (date_to - timedelta(microseconds=1)).date()
        calendar = employee._get_version(first_day).resource_calendar_id
        if calendar._is_flexible():
            days = round((stop - start).total_seconds() / 86400)
            weeks, rest = divmod(days, 7)
            per_week = calendar.hours_per_week
            return weeks * per_week + min(rest * calendar.hours_per_day, per_week)
        versions = employee._get_versions_with_contract_overlap_with_period(first_day, last_day)
        if not versions:
            # No contract on the period's days: the current schedule over the whole period.
            intervals = employee.resource_calendar_id._work_intervals_batch(
                date_from, date_to,
                resources_per_tz=employee._get_resources_per_tz(date_from),
                compute_leaves=True,
                domain=[('company_id', 'in', [False, employee.company_id.id]),
                        ('count_as', '=', 'absence')],
            )[employee.resource_id.id]
            return sum_intervals(intervals)
        # The block below (the no-version branch above and the loop that follows) follows
        # ``_get_expected_attendances`` in odoo/addons/hr/models/hr_employee.py of Odoo
        # Community (LGPL-3.0, Copyright Odoo S.A.), kept with its notice. The one change
        # (decision D5): only the versions that overlap the period's days are counted. The
        # Community's method also takes a contract that starts on the day after the period,
        # whose hours would lean into it when the zones differ.
        employee_tz = ZoneInfo(employee.tz) if employee.tz else None
        intervals = Intervals()
        previous = datetime.combine(versions[0].date_start, time.min, employee_tz)
        for version in versions:
            version_start = datetime.combine(version.date_start, time.min, employee_tz)
            contract_start = datetime.combine(version.contract_date_start, time.min, employee_tz)
            version_end = datetime.combine(version.date_end or date.max, time.max, employee_tz)
            begin = version_start if previous < version_start else contract_start
            intervals |= version.resource_calendar_id._work_intervals_batch(
                max(date_from, begin), min(date_to, version_end),
                resources_per_tz=version._get_resources_per_tz(),
                compute_leaves=True,
                domain=[('company_id', 'in', [False, employee.company_id.id]),
                        ('count_as', '=', 'absence')],
            )[employee.resource_id.id]
        return sum_intervals(intervals)
