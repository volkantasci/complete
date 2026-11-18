# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Employees Timeline',
    'summary': 'Employee rows for the Gantt view',
    'version': '20.0.1.0.0',
    'category': 'Human Resources/Employees',
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['hr', 'web_gantt'],
    'auto_install': True,
    'assets': {
        'web.assets_backend': [
            'hr_gantt/static/src/**/*',
        ],
        'web.assets_unit_tests': [
            'hr_gantt/static/tests/**/*.test.js',
            'hr_gantt/static/tests/employee_test_helpers.js',
        ],
    },
    'application': False,
    'installable': True,
}
