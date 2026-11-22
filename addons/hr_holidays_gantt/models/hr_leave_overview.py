# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import api, models


class HrLeave(models.Model):
    _inherit = 'hr.leave'

    @api.model
    def _hhg_overview_action(self):
        """The action the Overview menu opens, by the role of the current user (R3)."""
        Actions = self.env['ir.actions.actions']
        dashboard = Actions._for_xml_id('hr_holidays.action_hr_holidays_dashboard')
        if not self.env.user.has_group('hr_holidays.group_hr_holidays_user'):
            return dashboard
        management = Actions._for_xml_id('hr_holidays.hr_leave_action_action_approve_department')
        gantt_views = [view for view in management['views'] if view[1] == 'gantt']
        if 'gantt' not in (management['view_mode'] or '').split(',') or not gantt_views:
            return dashboard
        # the action keeps its id and path, so the address of the browser names the management
        # action and a reload opens that action with its own defaults
        management.update({
            'name': dashboard['name'],
            'view_mode': 'gantt',
            'views': gantt_views[:1],
            'domain': [
                ('employee_id.company_id', 'in', self.env.companies.ids),
                ('employee_id.active', '=', True),
                ('state', 'not in', ['refuse', 'cancel']),
            ],
            'context': {'hide_employee_name': 1},
            # our own key: the client drops this action from the session once it is shown, so a
            # reload opens the management action itself (A8)
            'hhg_overview': True,
        })
        return management
