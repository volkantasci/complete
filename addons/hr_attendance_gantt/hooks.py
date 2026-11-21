# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

_COMMUNITY_VIEW_MODE = 'list,form'
_COMMUNITY_MY_VIEW_MODE = 'calendar,list,pivot,graph'
# The context exactly as the Community module ships it (whitespace included).
_COMMUNITY_CONTEXT = """
            {
                "search_default_groupby_month": 1,
                "search_default_employee": 2
            }
        """


def restore_attendance_action(env):
    """Give the actions back the view modes and context the Community ships (R1)."""
    action = env.ref('hr_attendance.hr_attendance_action', raise_if_not_found=False)
    if action:
        action.write({'view_mode': _COMMUNITY_VIEW_MODE, 'context': _COMMUNITY_CONTEXT})
    mine = env.ref('hr_attendance.hr_attendance_my_action', raise_if_not_found=False)
    if mine:
        mine.write({'view_mode': _COMMUNITY_MY_VIEW_MODE})


def rename_attendance_view(cr):
    """Give the attendance Gantt view its identifier of model.md (migration 20.0.1.1.0).

    The ``ir_model_data`` row is renamed, so the view record keeps its database id (and the
    action view that names it, and every customization that inherits it). Nothing is done on a
    database that holds no row under the old name, or already holds one under the new name.
    """
    cr.execute(
        """
        UPDATE ir_model_data old
           SET name = 'hr_attendance_gantt_view'
         WHERE old.module = 'hr_attendance_gantt'
           AND old.name = 'hr_attendance_view_gantt'
           AND NOT EXISTS (
                SELECT 1 FROM ir_model_data new
                 WHERE new.module = old.module AND new.name = 'hr_attendance_gantt_view')
        """
    )
