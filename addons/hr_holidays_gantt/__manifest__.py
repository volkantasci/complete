# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Time Off Timeline',
    'summary': 'Gantt views of time off requests and of the time-off report',
    'version': '20.0.1.0.0',
    'category': 'Human Resources/Time Off',
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['hr_holidays', 'base_import', 'hr_gantt'],
    'auto_install': True,
    'application': False,
    'installable': True,
    'data': [
        'views/time_off_gantt_views.xml',
        'data/time_off_actions.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'hr_holidays_gantt/static/src/**/*',
        ],
        'web.assets_tests': ['hr_holidays_gantt/static/tests/tours/**/*'],
        'web.assets_unit_tests': [
            'hr_holidays_gantt/static/tests/**/*.test.js',
            'hr_holidays_gantt/static/tests/time_off_test_helpers.js',
        ],
    },
    'uninstall_hook': 'restore_time_off_records',
}
