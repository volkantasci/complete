# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Badge scanner button of the point of sale login screen, in a real browser.

The camera and the code detection are replaced by ``static/tests/camera_standin.js``; the
tours are in ``static/tests/tours/badge_scan_tours.js``.
"""
from odoo import Command
from odoo.addons.pos_hr.tests.test_frontend import TestPosHrHttpCommon
from odoo.tests import tagged

PHONE = '390x844'
DESKTOP = '1600x900'


@tagged('post_install', '-at_install')
class CwmBadgeScan(TestPosHrHttpCommon):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Setup of the acceptance package: employee login on, the administrator manages,
        # Ernest Reed (demo badge, no PIN) is an allowed cashier.
        cls.ernest = cls.env.ref('hr.employee_jgo').sudo()
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

    def _tour(self, name, *, size=PHONE, scheme='light'):
        self.browser_size = size
        self.touch_enabled = size == PHONE
        self.main_pos_config.with_user(self.pos_admin).open_ui()
        self.start_pos_tour(name, login='pos_admin', cookies={'pos_color_scheme': scheme})

    def test_A51_pin_step_button(self):
        for size in (DESKTOP, PHONE):
            for scheme in ('light', 'dark'):
                with self.subTest(size=size, scheme=scheme):
                    self._tour('cwm_badge_m9', size=size, scheme=scheme)

    def test_A52_scanner_opens(self):
        for size in (DESKTOP, PHONE):
            with self.subTest(size=size):
                self._tour('cwm_badge_open', size=size)

    def test_A53_badge_scanned(self):
        for size in (DESKTOP, PHONE):
            with self.subTest(size=size):
                self._tour('cwm_badge_scanned', size=size)

    def test_A54_camera_errors(self):
        self._tour('cwm_badge_refused')
        self._tour('cwm_badge_missing')

    def test_A55_empty_code(self):
        self._tour('cwm_badge_empty')

    def test_A56_no_camera_access(self):
        self._tour('cwm_badge_no_camera_access')

    def test_A58_close_scanner(self):
        self._tour('cwm_badge_close')

    def test_A59_unknown_badge(self):
        self._tour('cwm_badge_unknown')
