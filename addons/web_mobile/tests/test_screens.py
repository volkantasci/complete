# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of the mobile bridge states, taken on demand (not part of the normal run).

Run with ``--test-tags mobile_bridge_screens`` and ``--screenshots <dir>`` on a database with
the demo data and the Contacts, CRM, Project and Expenses applications. Files go to
``<dir>/mobile_bridge/`` under the names of the spec screens.
"""
import base64
import json
import pathlib
import struct
import time
import zlib

import odoo
from odoo.tests import tagged

from .test_user_menu import CwmUserMenuCase

TAGS = ('-standard', 'mobile_bridge_screens', 'post_install', '-at_install')
HOME_NOTE = '.o_notification_manager .o_notification'


def flat_png(red, green, blue):
    """A one-pixel PNG file, base64 encoded."""
    def chunk(kind, data):
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    raw = b'\x00' + bytes([red, green, blue])
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw))
        + chunk(b'IEND', b'')
    )
    return base64.b64encode(png).decode()


@tagged(*TAGS)
class CwmBridgeScreens(CwmUserMenuCase):

    def setUp(self):
        super().setUp()
        self.admin = self.env.ref('base.user_admin')
        self.settings = self.env['res.users.settings']._find_or_create_for_user(self.admin)

    def snap(self, stem, mobile):
        """Wait for the animations to end, then store the viewport as ``<stem>[.mobile].png``."""
        time.sleep(1.5)
        res = self.browser._websocket_request('Page.captureScreenshot')
        folder = pathlib.Path(odoo.tools.config['screenshots']) / 'mobile_bridge'
        folder.mkdir(parents=True, exist_ok=True)
        name = f'{stem}.mobile.png' if mobile else f'{stem}.png'
        (folder / name).write_bytes(base64.b64decode(res['data']))

    def each(self, stem, url, action, *, host, ua=None, dark=False, sizes=(False, True)):
        for mobile in sizes:
            with self.host_session(
                url, host=host, mobile=mobile, dark=dark, **({'ua': ua} if ua else {}),
            ):
                # classic scrollbars take width the captures of the spec do not show
                self.browser._websocket_request(
                    'Emulation.setScrollbarsHidden', params={'hidden': True})
                action(mobile)
                self.snap(stem, mobile)

    def home(self, mobile):
        self.wait("!!document.querySelector('.o_home_menu a.o_app')")

    def pipeline(self, mobile):
        self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")

    def in_menu(self, mobile):
        self.pipeline(mobile)
        self._entries(mobile)
        self.hide_install_entry()
        time.sleep(0.5)

    def hide_install_entry(self):
        """The headless browser offers its own "Install App" entry; the spec captures have none."""
        self.js(f"""[...document.querySelectorAll({json.dumps(self._entry_selector)})]
            .filter((e) => e.textContent.trim() === 'Install App')
            .forEach((e) => e.closest('.dropdown-item, a, li, div').remove())""")

    def press_shortcut(self, mobile):
        self._entries(mobile)
        self._choose('Add to Home Screen')
        self.wait(f"!!document.querySelector({json.dumps(HOME_NOTE)})")

    # -- S1, S2 ----------------------------------------------------------------------

    def test_s01_user_menu_in_app(self):
        self.each('01-user-menu-in-app', '/odoo/crm', self.in_menu, host={})

    def test_s02_user_menu_in_browser(self):
        self.each(
            '02-user-menu-in-browser', '/odoo/crm', self.in_menu, host=None, ua=self.UA_DESKTOP)

    # -- S3 ---------------------------------------------------------------------------

    def test_s03_shortcut_on_home_menu(self):
        def act(mobile):
            self.home(mobile)
            self.press_shortcut(mobile)

        self.each('03-shortcut-on-home-menu', '/odoo', act, host={})

    # -- S4 to S6 ---------------------------------------------------------------------

    def test_s04_ios_home_menu(self):
        self.each('04-ios-home-menu', '/odoo', self.home, host={}, ua=self.UA_IOS)

    def test_s05_ios_home_menu_dark(self):
        self.settings.color_scheme = 'dark'
        self.each(
            '05-ios-home-menu-dark', '/odoo', self.home, host={}, ua=self.UA_IOS, dark=True)

    def test_s06_android_home_menu(self):
        self.each('06-android-home-menu', '/odoo', self.home, host={}, sizes=(True,))

    # -- S7, S8 -----------------------------------------------------------------------

    def test_s07_shared_file_dialog(self):
        host = {
            'files': [{'uri': 'cwm-1', 'name': 'receipt.png', 'type': 'image/png'}],
            'fileBase64': flat_png(255, 128, 128),
        }

        def act(mobile):
            self.wait("!!document.querySelector('.modal .btn-primary[data-hotkey=\"S\"]')")

        self.each('07-shared-file-dialog', '/odoo', act, host=host)

    def test_s08_shared_file_notice(self):
        host = {
            'files': [{'uri': 'cwm-bad', 'name': 'receipt.png', 'type': 'image/png'}],
            'fileStatus': {'cwm-bad': 404},
        }

        def act(mobile):
            self.wait(f"!!document.querySelector({json.dumps(HOME_NOTE)})")

        self.each('08-shared-file-notice', '/odoo', act, host=host, sizes=(True,))

    # -- S16 --------------------------------------------------------------------------

    def test_s16_shortcut_notice(self):
        action = self.env['ir.actions.act_window'].create({
            'name': 'Cwm Scratch', 'res_model': 'res.partner', 'view_mode': 'list,form'})
        menu = self.env['ir.ui.menu'].create({
            'name': 'Cwm Scratch', 'sequence': 9001, 'web_icon': 'fa-star,#ffffff,#336699',
            'action': f'ir.actions.act_window,{action.id}'})

        def act(mobile):
            self.home(mobile)
            self._select_app(menu.id)
            self.press_shortcut(mobile)

        self.each('16-shortcut-notice', '/odoo', act, host={}, sizes=(True,))
