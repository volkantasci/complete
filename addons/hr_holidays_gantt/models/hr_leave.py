# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from odoo import api, fields, models
from odoo.tools.date_utils import sum_intervals
from odoo.tools.intervals import Intervals


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

    @api.model
    def _gantt_progress_bar(self, group_field, record_ids, period_start, period_stop):
        """The hours label of the employee rows (R16): ``{employee id: {'value': hours}}``.

        Internal users only; another field than the employee gets the base answer. The window
        is the period's days read in the browser's zone (``tz`` of the context, else the
        user's), then the same wall-clock times in each employee's own zone. An employee whose
        schedule in effect today (``hhg_today`` of the context, the browser's day) is flexible
        gets the hours of the Approved requests that overlap the window; any other the working
        hours of the window less the leaves. The hours are computed with the user's own rights,
        the versions are read with the system's.
        """
        if not self.env.user._is_internal():
            return {}
        if group_field != 'employee_id':
            return super()._gantt_progress_bar(group_field, record_ids, period_start, period_stop)
        if not record_ids or not period_start or not period_stop:
            return {}
        zone = ZoneInfo(self.env.context.get('tz') or self.env.user.tz or 'UTC')
        start = fields.Datetime.to_datetime(period_start).replace(tzinfo=UTC).astimezone(zone)
        stop = fields.Datetime.to_datetime(period_stop).replace(tzinfo=UTC).astimezone(zone)
        first_day = start.date()
        last_day = (stop - timedelta(microseconds=1)).date()
        # today is the browser's (the client sends it); the server's clock is read only when the
        # client sent nothing, and then in the browser's zone
        sent_today = self.env.context.get('hhg_today')
        today = (
            fields.Date.to_date(sent_today) if sent_today
            else fields.Date.context_today(self.with_context(tz=zone.key)))
        employees = self.env['hr.employee'].sudo().with_context(active_test=False)
        result = {}
        for employee in employees.browse(record_ids):
            own_zone = ZoneInfo(employee.tz) if employee.tz else UTC
            date_from = datetime.combine(first_day, time.min, own_zone)
            date_to = datetime.combine(last_day + timedelta(days=1), time.min, own_zone)
            version = employee._get_version(today)
            # an employee without a version reads the schedule of his resource
            schedule = version.resource_calendar_id if version else employee.resource_id.calendar_id
            if schedule._is_flexible():
                hours = self._hhg_leave_hours(employee.id, date_from, date_to)
            else:
                hours = self._hhg_working_hours(employee, first_day, last_day, date_from, date_to)
            result[employee.id] = {'value': hours}
        return result

    @api.model
    def _hhg_leave_hours(self, employee_id, date_from, date_to):
        """The whole hours of the employee's Approved requests that overlap the window."""
        requests = self.env['hr.leave'].search([
            ('employee_id', '=', employee_id),
            ('state', '=', 'validate'),
            ('date_from', '<', date_to.astimezone(UTC).replace(tzinfo=None)),
            ('date_to', '>', date_from.astimezone(UTC).replace(tzinfo=None)),
        ])
        return sum(requests.mapped('number_of_hours'))

    @api.model
    def _hhg_working_hours(self, employee, first_day, last_day, date_from, date_to):
        """The hours the schedule counts in the window, the leaves taken off, for a (sudo) employee.

        The version in effect on each day is read by its own dates (the first one also before
        its date), the contract dates are ignored: an employee out of contract reads the hours
        of his schedule as well. An employee without a version reads the schedule of his
        resource. The company-wide leaves and the employee's validated leaves are taken off.
        The schedules and leaves are read with the user's rights; the versions with the
        system's.
        """
        calendars = self.env['resource.calendar']
        resource = self.env['resource.resource'].browse(employee.resource_id.id)
        leave_domain = [
            ('company_id', 'in', [False, employee.company_id.id]), ('count_as', '=', 'absence')]
        versions = employee.version_ids.filtered('active') or employee.version_ids
        versions = versions.sorted('date_version')
        if not versions:
            intervals = calendars.browse(employee.resource_id.calendar_id.id)._work_intervals_batch(
                date_from, date_to,
                resources_per_tz={ZoneInfo(employee._get_tz(date=date_from)): resource},
                compute_leaves=True, domain=leave_domain,
            )[resource.id]
            return sum_intervals(intervals)
        zone = date_from.tzinfo
        intervals = Intervals()
        for index, version in enumerate(versions):
            begin = date_from if index == 0 else max(
                date_from, datetime.combine(version.date_version, time.min, zone))
            end = date_to
            if index + 1 < len(versions):
                end = min(date_to, datetime.combine(
                    versions[index + 1].date_version, time.min, zone))
            if begin >= end:
                continue
            intervals |= calendars.browse(version.resource_calendar_id.id)._work_intervals_batch(
                begin, end,
                resources_per_tz={ZoneInfo(version._get_tz()): resource},
                compute_leaves=True, domain=leave_domain,
            )[resource.id]
        return sum_intervals(intervals)
