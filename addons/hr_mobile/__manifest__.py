# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Employees Mobile',
    'summary': 'Send the account details to the native app when Employees preferences are saved',
    'version': '20.0.1.0.0',
    'category': 'Hidden',
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['hr', 'web_mobile'],
    'auto_install': True,
    'data': [],
    'assets': {
        'web.assets_backend': [
            'hr_mobile/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
}
