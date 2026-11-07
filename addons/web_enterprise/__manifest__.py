# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Web Enterprise',
    'summary': 'Home menu, adapted top bar and colour scheme for the web client',
    'version': '20.0.1.0.0',
    'category': 'Hidden',
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['web', 'base_setup'],
    'auto_install': True,
    'data': [
        'views/res_users_views.xml',
    ],
    'installable': True,
    'application': False,
}
