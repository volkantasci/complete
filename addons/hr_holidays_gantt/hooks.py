# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

_COMMUNITY_DASHBOARD_VIEW_MODE = 'calendar'
_COMMUNITY_MANAGEMENT_VIEW_MODE = 'list,kanban,form,calendar,activity'


def restore_time_off_records(env):
    """Give the Community records back what the bridge changed (R1)."""
    dashboard = env.ref('hr_holidays.action_hr_holidays_dashboard', raise_if_not_found=False)
    menu = env.ref('hr_holidays.menu_hr_holidays_dashboard', raise_if_not_found=False)
    if menu and dashboard:
        menu.write({'action': f'ir.actions.act_window,{dashboard.id}'})
    if dashboard:
        dashboard.write({'view_mode': _COMMUNITY_DASHBOARD_VIEW_MODE})
    management = env.ref(
        'hr_holidays.hr_leave_action_action_approve_department', raise_if_not_found=False)
    if management:
        management.write({'view_mode': _COMMUNITY_MANAGEMENT_VIEW_MODE})
