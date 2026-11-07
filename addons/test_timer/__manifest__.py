# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Timer Tests',
    'summary': 'Timer feature and behaviour tests',
    'version': '20.0.1.0.0',
    'category': 'Hidden/Tests',
    'sequence': 8765,
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['timer'],
    'data': [
        'security/test_timer_groups.xml',
        'security/ir.access.csv',
        'views/timer_test_views.xml',
    ],
    'demo': ['data/timer_test_demo.xml'],
    'assets': {
        'web.assets_backend': ['test_timer/static/src/**/*'],
        'web.assets_tests': ['test_timer/static/tests/tours/**/*'],
    },
    'installable': True,
    'application': False,
}
