# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import api, fields, models
from odoo.exceptions import AccessError
from odoo.tools import float_round


class HrEmployeePublic(models.Model):
    _inherit = 'hr.employee.public'

    avatar_leave_summary = fields.Json(
        string='Leave Summary of the Card', compute='_compute_avatar_leave_summary')
    avatar_hours_per_week = fields.Float(
        string='Hours per Week of the Card', compute='_compute_avatar_hours_per_week')

    def _compute_avatar_hours_per_week(self):
        # the schedule is read in sudo, as the Community's own hours of the public record are
        for employee in self:
            employee.avatar_hours_per_week = employee.sudo().resource_calendar_id.hours_per_week

    def _compute_avatar_leave_summary(self):
        """One entry per leave type with time allocated or taken, the smallest time left first.

        Only for Employees officers. Allocated is the sum of the type's approved allocations
        (archived ones too, whatever their dates), taken the sum of its Approved requests, past
        and future; waiting requests are not counted and the time left is the difference (R18
        point 2). Both are read with the user's own rights: a user who may not read the
        allocations or the requests gets no line.
        """
        for employee in self:
            employee.avatar_leave_summary = []
        if not self or not self.env.user.has_group('hr.group_hr_user'):
            return
        employees = self.env['hr.employee'].browse(self.ids).exists()
        countries = employees.company_id.country_id
        types = self.env['hr.work.entry.type'].search(
            ['|', ('country_id', '=', False), ('country_id', 'in', countries.ids)], order='id')
        if not types:
            return
        try:
            allocated = self._hhg_summed(
                self.env['hr.leave.allocation'].with_context(active_test=False), employees, types)
            taken = self._hhg_summed(self.env['hr.leave'], employees, types)
        except AccessError:
            return
        for employee in employees:
            country = employee.company_id.country_id
            entries = []
            for work_type in types:
                if work_type.country_id and work_type.country_id != country:
                    continue
                hours = work_type.unit_of_measure == 'hour'
                key = (employee.id, work_type.id)
                given = allocated.get(key, (0.0, 0.0))[1 if hours else 0]
                used = taken.get(key, (0.0, 0.0))[1 if hours else 0]
                if not (given > 0 or used > 0):
                    continue
                requires_allocation = bool(work_type.requires_allocation)
                entries.append({
                    'name': work_type.name,
                    'taken': float_round(used, precision_digits=2),
                    'left': float_round(given - used, precision_digits=2) if requires_allocation
                    else 0.0,
                    'requires_allocation': requires_allocation,
                    'unit': 'hours' if hours else 'days',
                })
            # sorted() is stable: equal amounts keep the types' order
            entries.sort(key=lambda entry: entry['left'])
            self.browse(employee.id).avatar_leave_summary = entries

    @api.model
    def _hhg_summed(self, model, employees, types):
        """``{(employee id, type id): (days, hours)}`` of the approved records of ``model``."""
        groups = model._read_group(
            [('state', '=', 'validate'), ('employee_id', 'in', employees.ids),
             ('work_entry_type_id', 'in', types.ids)],
            ['employee_id', 'work_entry_type_id'],
            ['number_of_days:sum', 'number_of_hours:sum'])
        return {
            (employee.id, work_type.id): (days, hours)
            for employee, work_type, days, hours in groups}

    def hhg_open_leave_dashboard(self, scale=None):
        """The Community time-off dashboard of this employee, for any user (R18 point 3).

        The Community method only builds an action from the ids, so the private employee is
        not read; the public record's own method answers for the user's employee alone.
        """
        self.ensure_one()
        return self.env['hr.employee'].browse(self.id).action_time_off_dashboard(scale=scale)
