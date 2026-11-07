# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Timer',
    'summary': 'Record time',
    'version': '20.0.1.0.0',
    'category': 'Services/Timesheets',
    'sequence': 24,
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['web', 'mail'],
    'data': [
        'security/ir.access.csv',
    ],
    'assets': {
        'web.assets_backend': [
            'timer/static/src/**/*',
        ],
        'web.assets_unit_tests': [
            'timer/static/tests/**/*',
        ],
    },
    'installable': True,
    'application': False,
}
