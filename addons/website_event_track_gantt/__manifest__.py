# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Event Tracks Timeline',
    'summary': 'Plan the tracks of an event on a timeline',
    'version': '20.0.1.0.0',
    'category': 'Marketing',
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['website_event_track', 'web_gantt'],
    'auto_install': True,
    'application': False,
    'installable': True,
    'data': [
        'views/event_track_views.xml',
        'views/event_event_views.xml',
    ],
    'assets': {
        'web.assets_tests': ['website_event_track_gantt/static/tests/tours/**/*'],
    },
    'uninstall_hook': 'restore_track_actions',
}
