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
        'web.assets_backend': ['web_gantt/static/src/**/*'],
        'web.assets_unit_tests': ['web_gantt/static/tests/**/*'],
    },
    'installable': True,
    'application': False,
}
