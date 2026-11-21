# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import fields, models


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

        Only for Employees officers; the amounts are the Community's, read with the user's
        own rights.
        """
        for employee in self:
            employee.avatar_leave_summary = []
        if not self or not self.env.user.has_group('hr.group_hr_user'):
            return
        employees = self.env['hr.employee'].browse(self.ids).exists()
        countries = employees.company_id.country_id
        types = self.env['hr.work.entry.type'].search(
            ['|', ('country_id', '=', False), ('country_id', 'in', countries.ids)], order='id')
        data = types.get_allocation_data(employees) if types else {}
        for employee in employees:
            country = employee.company_id.country_id
            entries = []
            for name, info, requires_allocation, type_id in data.get(employee, []):
                valid_for = self.env['hr.work.entry.type'].browse(type_id).country_id
                if valid_for and valid_for != country:
                    continue
                if not (info['max_leaves'] > 0 or info['leaves_taken'] > 0):
                    continue
                entries.append({
                    'name': name,
                    'taken': info['leaves_taken'],
                    'left': info['remaining_leaves'],
                    'requires_allocation': bool(requires_allocation),
                    'unit': 'hours' if info['unit_of_measure'] == 'hour' else 'days',
                })
            # sorted() is stable: equal amounts keep the Community's order
            entries.sort(key=lambda entry: entry['left'])
            self.browse(employee.id).avatar_leave_summary = entries

    def hhg_open_leave_dashboard(self, scale=None):
        """The Community time-off dashboard of this employee, for any user (R18 point 3).

        The Community method only builds an action from the ids, so the private employee is
        not read; the public record's own method answers for the user's employee alone.
        """
        self.ensure_one()
        return self.env['hr.employee'].browse(self.id).action_time_off_dashboard(scale=scale)
