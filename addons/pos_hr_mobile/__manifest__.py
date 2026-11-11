# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
{
    'name': 'Point of Sale Camera Badge Login',
    'summary': 'Scan the cashier badge with the camera on the point of sale login screen',
    'version': '20.0.1.0.0',
    'category': 'Hidden',
    'license': 'AGPL-3',
    'author': 'Complete contributors',
    'website': 'https://github.com/volkantasci/complete',
    'depends': ['pos_hr', 'web_mobile'],
    'auto_install': True,
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_hr_mobile/static/src/login_scanner.js',
            'pos_hr_mobile/static/src/login_scanner.xml',
            'pos_hr_mobile/static/src/scanner_buttons.scss',
            'barcodes/static/src/components/barcode_scanner.scss',
        ],
        'web.assets_tests': [
            'pos_hr_mobile/static/tests/**/*',
        ],
    },
    'installable': True,
    'application': False,
}
