# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Gantt View',
    'summary': 'A read-only timeline view that lays records out on a time grid',
    'version': '20.0.1.0.0',
    'category': 'Hidden',
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['web'],
    'auto_install': True,
    'data': [],
    'assets': {
        'web.assets_backend': [
            'web_gantt/static/src/**/*',
            # dark-only rules belong to the dark stylesheet
            ('remove', 'web_gantt/static/src/timeline_renderer.dark.scss'),
            ('remove', 'web_gantt/static/src/timeline.variables.dark.scss'),
        ],
        'web.assets_web_dark': [
            # the dark values of our own variables come before the light defaults
            ('before', 'web_gantt/static/src/timeline.variables.scss',
             'web_gantt/static/src/timeline.variables.dark.scss'),
            'web_gantt/static/src/timeline_renderer.dark.scss',
        ],
        'web.assets_unit_tests': [
            'web_gantt/static/tests/**/*.test.js',
            'web_gantt/static/tests/timeline_test_helpers.js',
        ],
    },
    'installable': True,
    'application': False,
}
