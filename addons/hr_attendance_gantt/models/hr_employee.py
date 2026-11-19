# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import models


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    def action_open_last_month_attendances(self):
        """R4: the Community's action of the worked-hours button (List, Form), and the monthly
        Gantt view as its third view. The web client adds the employee's id to the context as
        ``active_id`` when the button runs; the view and its overview read it there."""
        action = super().action_open_last_month_attendances()
        monthly = self.env.ref(
            'hr_attendance_gantt.hr_attendance_gantt_view_employee_monthly_hours')
        action['views'] = [*action['views'], [monthly.id, 'gantt']]
        return action
