# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of the badge scanner states, taken on demand (not part of the normal run).

Run with ``--test-tags mobile_bridge_screens`` and ``--screenshots <dir>`` on a database with
the demo data and ``pos_hr_mobile``. The tours of ``static/tests/tours/badge_screens_tours.js``
reach each state and log ``cwm-shot <name>``; this test then captures the viewport into
``<dir>/mobile_bridge/<name>.png``.
"""
import base64
import pathlib
from unittest import mock

import odoo
from odoo import Command
from odoo.addons.pos_hr.tests.test_frontend import TestPosHrHttpCommon
from odoo.tests import tagged
from odoo.tests.common import ChromeBrowser

PHONE = '390x844'
DESKTOP = '1600x900'
MARK = 'cwm-shot '


@tagged('-standard', 'mobile_bridge_screens', 'post_install', '-at_install')
class CwmBadgeScreens(TestPosHrHttpCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # the demo cashier when it exists, else an employee of the same name
        cls.ernest = cls.env.ref('hr.employee_jgo', raise_if_not_found=False)
        if not cls.ernest:
            cls.ernest = cls.env['hr.employee'].sudo().create({
                'name': 'Ernest Reed', 'company_id': cls.main_pos_config.company_id.id,
            })
        cls.ernest = cls.ernest.sudo()
        cls.ernest.write({
            'barcode': '041517863199',
            'pin': False,
            'company_id': cls.main_pos_config.company_id.id,
        })
        cls.main_pos_config.write({
            'module_pos_hr': True,
            'manager_employee_ids': [Command.set(cls.admin.ids)],
            'cashier_employee_ids': [Command.set(cls.ernest.ids)],
            'restrictive_employee_ids': [Command.clear()],
        })

    def _tour(self, name, size):
        folder = pathlib.Path(odoo.tools.config['screenshots']) / 'mobile_bridge'
        folder.mkdir(parents=True, exist_ok=True)
        original = ChromeBrowser._handle_console

        def handle(browser, type=None, args=None, **kw):  # pylint: disable=redefined-builtin
            text = str(browser._from_remoteobject(args[0])) if args else ''
            if text.startswith(MARK):
                target = folder / f'{text[len(MARK):].strip()}.png'
                future = browser._websocket_send('Page.captureScreenshot', with_future=True)

                def save(done, target=target):
                    target.write_bytes(base64.b64decode(done.result(timeout=0)['data']))

                future.add_done_callback(save)
            return original(browser, type=type, args=args, **kw)

        self.browser_size = size
        self.touch_enabled = size == PHONE
        self.main_pos_config.with_user(self.pos_admin).open_ui()
        with mock.patch.object(ChromeBrowser, '_handle_console', handle):
            self.start_pos_tour(name, login='pos_admin', cookies={'pos_color_scheme': 'light'})

    def test_login_and_scanner(self):
        for size in (DESKTOP, PHONE):
            self._tour('cwm_shot_login', size)
            self._tour('cwm_shot_scanner', size)

    def test_phone_states(self):
        for name in (
            'cwm_shot_refused', 'cwm_shot_missing', 'cwm_shot_empty', 'cwm_shot_scanned',
        ):
            self._tour(name, PHONE)
