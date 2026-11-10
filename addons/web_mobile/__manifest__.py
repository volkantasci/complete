# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Mobile',
    'summary': 'Bridge between the web client and the native mobile apps',
    'version': '20.0.1.0.0',
    'category': 'Hidden',
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['web_enterprise'],
    'auto_install': True,
    'data': [
        'views/res_users_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'web_mobile/static/src/**/*',
        ],
        'web.assets_unit_tests': [
            'web_mobile/static/tests/**/*.test.js',
            'web_mobile/static/tests/helpers/**/*',
        ],
    },
    'installable': True,
    'application': False,
}
