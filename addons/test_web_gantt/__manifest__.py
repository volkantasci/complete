# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Gantt View Tests',
    'summary': 'Test models for the Gantt view',
    'version': '20.0.1.0.0',
    'category': 'Hidden',
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['web_gantt'],
    'auto_install': False,
    'data': [
        'security/ir.access.csv',
        'data/host_fields.xml',
        'data/host_views.xml',
    ],
    'demo': [
        'demo/host_records.xml',
    ],
    'assets': {
        'web.assets_tests': [
            'test_web_gantt/static/tests/tours/**/*',
        ],
    },
    'installable': True,
    'application': False,
}
