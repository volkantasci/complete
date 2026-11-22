# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

_COMMUNITY_DASHBOARD_VIEW_MODE = 'calendar'
_COMMUNITY_MANAGEMENT_VIEW_MODE = 'list,kanban,form,calendar,activity'


def _community_record(env, xmlid):
    """The existing record named by ``xmlid``, or None when the Community no longer has it."""
    model, res_id = env['ir.model.data']._xmlid_to_res_model_res_id(xmlid)
    return env[model].browse(res_id).exists() if res_id else None


def restore_time_off_records(env):
    """Give the Community records back what the bridge changed (R1)."""
    dashboard = _community_record(env, 'hr_holidays.action_hr_holidays_dashboard')
    menu = _community_record(env, 'hr_holidays.menu_hr_holidays_dashboard')
    if menu and dashboard:
        menu.write({'action': f'ir.actions.act_window,{dashboard.id}'})
    if dashboard:
        dashboard.write({'view_mode': _COMMUNITY_DASHBOARD_VIEW_MODE})
    management = _community_record(
        env, 'hr_holidays.hr_leave_action_action_approve_department')
    if management:
        management.write({'view_mode': _COMMUNITY_MANAGEMENT_VIEW_MODE})
