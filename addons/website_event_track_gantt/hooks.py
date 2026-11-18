# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

_COMMUNITY_VIEW_MODE = 'kanban,list,form,calendar,graph,activity'


def restore_track_actions(env):
    """Give both track actions back the values the Community module ships."""
    menu_action = env.ref('website_event_track.action_event_track', raise_if_not_found=False)
    if menu_action:
        menu_action.write({'view_mode': _COMMUNITY_VIEW_MODE, 'context': '{}'})
    event_action = env.ref(
        'website_event_track.action_event_track_from_event', raise_if_not_found=False)
    if event_action:
        event_action.write({'view_mode': _COMMUNITY_VIEW_MODE})
