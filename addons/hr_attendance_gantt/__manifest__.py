# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Attendances Timeline',
    'summary': 'Attendances of the employees on a timeline',
    'version': '20.0.1.0.0',
    'category': 'Human Resources/Attendances',
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['hr_attendance', 'hr_gantt'],
    'auto_install': True,
    'application': False,
    'installable': True,
    'data': ['views/hr_attendance_gantt_views.xml'],
    'assets': {
        'web.assets_backend': [
            'hr_attendance_gantt/static/src/**/*',
        ],
        'web.assets_tests': ['hr_attendance_gantt/static/tests/tours/**/*'],
        'web.assets_unit_tests': [
            'hr_attendance_gantt/static/tests/**/*.test.js',
            'hr_attendance_gantt/static/tests/attendance_test_helpers.js',
        ],
    },
    'uninstall_hook': 'restore_attendance_action',
}
