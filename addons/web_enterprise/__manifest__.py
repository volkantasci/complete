# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Web Enterprise',
    'summary': 'Home menu, adapted top bar and colour scheme for the web client',
    'version': '20.0.1.1.0',
    'category': 'Hidden',
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': [
        'web',
        'base_setup',
    ],
    'auto_install': True,
    'data': [
        'views/res_users_views.xml',
        'views/webclient_templates.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'web_enterprise/static/src/**/*',
            # the pivot view is lazy loaded: its patch goes with it
            ('remove', 'web_enterprise/static/src/views/pivot_renderer_patch.js'),
            ('remove', 'web_enterprise/static/src/theme/graph_pivot.scss'),
            ('remove', 'web_enterprise/static/src/views/graph_fill_patch.js'),
            ('remove', 'web_enterprise/static/src/views/graph_renderer_patch.xml'),
            # the role files are placed explicitly, ahead of the Community
            # primary variables
            ('remove', 'web_enterprise/static/src/theme/roles_light.scss'),
            ('remove', 'web_enterprise/static/src/theme/roles_dark.scss'),
            ('before', 'web/static/src/scss/primary_variables.scss',
             'web_enterprise/static/src/theme/roles_light.scss'),
            # dark-only rules belong to the dark stylesheet
            ('remove', 'web_enterprise/static/src/**/*.dark.scss'),
        ],
        'web.assets_backend_lazy': [
            ('before', 'web/static/src/scss/primary_variables.scss',
             'web_enterprise/static/src/theme/roles_light.scss'),
            'web_enterprise/static/src/theme/role_properties.scss',
            'web_enterprise/static/src/views/pivot_renderer_patch.js',
            'web_enterprise/static/src/theme/graph_pivot.scss',
            'web_enterprise/static/src/views/graph_fill_patch.js',
            'web_enterprise/static/src/views/graph_renderer_patch.xml',
        ],
        'web.dark_mode_variables': [
            ('before', 'web_enterprise/static/src/theme/roles_light.scss',
             'web_enterprise/static/src/theme/roles_dark.scss'),
        ],
        'web.assets_web_dark': [
            'web_enterprise/static/src/**/*.dark.scss',
            ('include', 'web.dark_mode_variables'),
        ],
        'web.assets_backend_lazy_dark': [
            ('include', 'web.dark_mode_variables'),
        ],
        'web.assets_unit_tests': [
            'web_enterprise/static/tests/*.test.js',
        ],
        'web.assets_tests': [
            'web_enterprise/static/tests/tours/**/*',
        ],
    },
    'installable': True,
    'application': False,
}
