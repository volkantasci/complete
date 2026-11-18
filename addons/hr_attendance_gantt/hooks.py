# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

_COMMUNITY_VIEW_MODE = 'list,form'
# The context exactly as the Community module ships it (whitespace included).
_COMMUNITY_CONTEXT = """
            {
                "search_default_groupby_month": 1,
                "search_default_employee": 2
            }
        """


def restore_attendance_action(env):
    """Give the management action back the view modes and context the Community ships."""
    action = env.ref('hr_attendance.hr_attendance_action', raise_if_not_found=False)
    if action:
        action.write({'view_mode': _COMMUNITY_VIEW_MODE, 'context': _COMMUNITY_CONTEXT})
