# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import base64
import json
import struct
import time
import unittest

from odoo.tests import tagged

from .mobile_host import CwmHostCase

GRID = ".o_navbar .o_menu_toggle:not(.o_menu_toggle_back):not(.o_hidden)"
TILES = "[...document.querySelectorAll('.o_home_menu a.o_app')]"
ACCOUNT_KEYS = ['avatar', 'db', 'name', 'uid', 'username']
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
SVG = (
    b'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">'
    b'<rect width="8" height="8"/></svg>'
)


@tagged('post_install', '-at_install')
class CwmSyncCase(CwmHostCase):
    """Base: the application list and the account details."""

    def setUp(self):
        super().setUp()
        self.admin = self.env.ref('base.user_admin')
        self.settings = self.env['res.users.settings']._find_or_create_for_user(self.admin)
        self.addCleanup(self._restore_settings, self.settings.homemenu_config)

    def _restore_settings(self, value):
        self.settings.homemenu_config = value

    def _is_installed(self, name):
        return bool(self.env['ir.module.module'].search(
            [('name', '=', name), ('state', '=', 'installed')], limit=1))

    # -- page helpers ----------------------------------------------------------------

    def home_ready(self):
        self.wait(f"{TILES}.length > 0")

    def tile_xmlids(self):
        return self.js(f"{TILES}.map((a) => a.dataset.menuXmlid)")

    def app_lists(self):
        return [entry['args'] for entry in self.host_requests('updateAvailableApps')]

    def wait_requests(self, action, count, timeout=30):
        self.wait(
            f"(window.__cwmHostLog || []).filter((e) => e.action === {json.dumps(action)})"
            f".length >= {count}", timeout=timeout)

    def settle(self, seconds=1.5):
        time.sleep(seconds)

    def open_tile(self, xmlid):
        self.js(
            "document.querySelector("
            f"'.o_home_menu a.o_app[data-menu-xmlid=\"{xmlid}\"]').click()")
        self.wait(
            "!document.querySelector('.o_home_menu') && !!document.querySelector('.o_action')")

    def back_home(self):
        self.wait(f"!!document.querySelector({json.dumps(GRID)})")
        self.js(f"document.querySelector({json.dumps(GRID)}).click()")
        self.wait("!!document.querySelector('.o_home_menu')")
        self.home_ready()

    # -- preferences dialog ----------------------------------------------------------

    def open_preferences(self):
        self.js("document.querySelector('.o_user_menu').click()")
        self.wait("!!document.querySelector('.o-dropdown--menu .dropdown-item')")
        self.js("""[...document.querySelectorAll('.o-dropdown--menu .dropdown-item')]
            .find((e) => e.textContent.trim() === 'My Preferences').click()""")
        self.wait("!!document.querySelector('.modal .o_form_view [name=name] input')")

    def set_field(self, name, value):
        self.js(f"""(() => {{
            const input = document.querySelector('.modal [name={name}] input');
            input.focus();
            input.value = {json.dumps(value)};
            input.dispatchEvent(new Event('input', {{bubbles: true}}));
            input.dispatchEvent(new Event('change', {{bubbles: true}}));
            return true;
        }})()""")

    def save_preferences(self):
        self.js("document.querySelector('.modal-footer button[name=preference_save]').click()")

    def png_size(self, avatar):
        raw = base64.b64decode(avatar)
        self.assertEqual(raw[:8], PNG_SIGNATURE)
        return struct.unpack('>II', raw[16:24])

    def assert_no_error_ui(self):
        self.assertFalse(self.js(
            "!!document.querySelector('.o_error_dialog, .modal .modal-title:not(:empty)"
            "[class*=error])")
        )


class TestAppList(CwmSyncCase):

    def test_A15_A16_A17_app_list(self):
        with self.host_session(host={}, ua=self.UA_DESKTOP) as _browser:
            self.home_ready()
            self.wait_requests('updateAvailableApps', 1)
            tiles = self.tile_xmlids()
            sent = self.app_lists()
            # A15: one list, one entry per tile in the tile order, shape of the contract
            self.assertEqual(len(sent), 1)
            self.assertEqual([entry['xmlid'] for entry in sent[0]], tiles)
            first = sent[0][0]
            self.assertEqual(sorted(first), ['link', 'name', 'pngIcon', 'xmlid'])
            self.assertTrue(first['link'].startswith('/odoo/'))
            self.assertNotIn('debug', first['link'])
            self.assertTrue(first['name'])
            self.assertEqual(base64.b64decode(first['pngIcon'])[:8], PNG_SIGNATURE)
            if self._is_installed('mail'):
                self.assertEqual(first['xmlid'], 'mail.menu_root_discuss')
                self.assertEqual(first['name'], 'Discuss')
            # the tile to open and to drag is the last one, whatever apps are installed
            if len(tiles) < 2:
                self.skipTest('fewer than two applications installed')
            last = tiles[-1]
            # A16: open an app and come back, twice: nothing more is sent
            for _ in range(2):
                self.open_tile(last)
                self.back_home()

            self.settle()
            self.assertEqual(len(self.app_lists()), 1)
            # A17: drag the last tile to the first place
            self.drag_tile_first(last)
            self.wait_requests('updateAvailableApps', 2)
            self.open_tile(last)
            self.back_home()
            lists = self.app_lists()
            self.assertEqual(len(lists), 2)
            self.assertEqual(lists[1][0]['xmlid'], last)
            self.assertEqual(
                [entry['xmlid'] for entry in lists[1]], self.tile_xmlids())
            self.assertEqual(
                sorted(entry['xmlid'] for entry in lists[1]),
                sorted(entry['xmlid'] for entry in lists[0]))

    def drag_tile_first(self, xmlid):
        """A real press-and-hold drag with the pointer, as 001a's reordering expects."""
        request = self.browser._websocket_request
        rects = self.js(f"""(() => {{
            const rect = (el) => {{
                const r = el.getBoundingClientRect();
                return {{x: r.x + r.width / 2, y: r.y + r.height / 2}};
            }};
            const tiles = {TILES};
            return {{
                from: rect(tiles.find((a) => a.dataset.menuXmlid === {json.dumps(xmlid)})),
                to: rect(tiles[0]),
            }};
        }})()""")
        src, dst = rects['from'], rects['to']

        def mouse(kind, x, y, **kw):
            request('Input.dispatchMouseEvent', params={
                'type': kind, 'x': x, 'y': y, 'button': 'left', 'buttons': 1, **kw})

        request('Input.dispatchMouseEvent', params={
            'type': 'mouseMoved', 'x': src['x'], 'y': src['y']})
        mouse('mousePressed', src['x'], src['y'], clickCount=1)
        time.sleep(.8)  # the hold
        mouse('mouseMoved', src['x'] + 14, src['y'])
        steps = 8
        for index in range(1, steps + 1):
            mouse('mouseMoved',
                  src['x'] + (dst['x'] - src['x']) * index / steps,
                  src['y'] + (dst['y'] - src['y']) * index / steps)
            time.sleep(.05)
        mouse('mouseMoved', dst['x'] - 20, dst['y'])
        request('Input.dispatchMouseEvent', params={
            'type': 'mouseReleased', 'x': dst['x'] - 20, 'y': dst['y'], 'button': 'left',
            'buttons': 0, 'clickCount': 1})
        self.wait(f"{TILES}[0].dataset.menuXmlid === {json.dumps(xmlid)}")

    def test_A18_icons(self):
        Menu = self.env['ir.ui.menu']
        Action = self.env['ir.actions.act_window']
        glyph_action = Action.create({
            'name': 'Cwm Glyph', 'res_model': 'res.partner', 'view_mode': 'list,form'})
        svg_action = Action.create({
            'name': 'Cwm Svg', 'res_model': 'res.partner', 'view_mode': 'list,form',
            'path': 'cwm-svg'})
        glyph = Menu.create({
            'name': 'Cwm Glyph', 'sequence': 9001, 'web_icon': 'fa-star,#ffffff,#336699',
            'action': f'ir.actions.act_window,{glyph_action.id}'})
        svg = Menu.create({
            'name': 'Cwm Svg', 'sequence': 9002,
            'web_icon_data': base64.b64encode(SVG).decode(),
            'action': f'ir.actions.act_window,{svg_action.id}'})
        for menu, name in ((glyph, 'cwm_glyph'), (svg, 'cwm_svg')):
            self.env['ir.model.data'].create({
                'module': 'cwm_test', 'name': name, 'model': 'ir.ui.menu', 'res_id': menu.id})
        with self.host_session(host={}, ua=self.UA_DESKTOP):
            self.home_ready()
            self.wait_requests('updateAvailableApps', 1)
            by_name = {entry['name']: entry for entry in self.app_lists()[0]}
            self.assertIsNone(by_name['Cwm Glyph']['pngIcon'])
            self.assertIsNone(by_name['Cwm Svg']['pngIcon'])
            self.assertEqual(by_name['Cwm Glyph']['xmlid'], 'cwm_test.cwm_glyph')
            self.assertEqual(by_name['Cwm Glyph']['link'], f'/odoo/action-{glyph_action.id}')
            self.assertEqual(by_name['Cwm Svg']['link'], '/odoo/cwm-svg')
            self.assertTrue(any(
                entry['pngIcon'] for name, entry in by_name.items()
                if not name.startswith('Cwm ')))


class TestAccount(CwmSyncCase):

    def account_requests(self):
        return [entry['args'] for entry in self.host_requests('updateAccount')]

    def test_A19_account_at_load(self):
        with self.host_session(host={}, ua=self.UA_DESKTOP):
            self.wait_requests('updateAccount', 1)
            self.settle()
            args = self.cwm_expect_one(self.account_requests())
            self.assertEqual(sorted(args), ACCOUNT_KEYS)
            self.assertEqual(args['name'], self.admin.name)
            self.assertEqual(args['username'], 'admin')
            self.assertEqual(args['uid'], self.admin.id)
            self.assertEqual(args['db'], self.env.cr.dbname)
            self.assertEqual(self.png_size(args['avatar']), (128, 128))

    def test_A19_account_without_uploaded_picture(self):
        # Community then serves a generated vector avatar
        partner = self.admin.partner_id
        original = partner.image_1920 and partner.image_1920.to_base64()
        self.addCleanup(partner.write, {'image_1920': original})
        partner.image_1920 = False
        with self.host_session(host={}, ua=self.UA_DESKTOP):
            self.wait_requests('updateAccount', 1)
            self.settle()
            args = self.cwm_expect_one(self.account_requests())
            self.assertEqual(self.png_size(args['avatar']), (128, 128))

    def test_A20_saved_values(self):
        original = self.admin.name
        self.addCleanup(self.admin.write, {'name': original})
        with self.host_session(host={}, ua=self.UA_ANDROID):
            self.wait_requests('updateAccount', 1)
            self.open_preferences()
            self.arm_unload_snapshot()
            self.set_field('name', 'Mitchell Admin B')
            self.save_preferences()
            log = [e for e in self.unload_snapshot() if e['action'] == 'updateAccount']
            # the first request after the save carries the saved name, before the reload
            self.assertEqual(len(log), 2)
            self.assertEqual(log[0]['args']['name'], original)
            self.assertEqual(log[1]['args']['name'], 'Mitchell Admin B')
            self.assertEqual(log[1]['args']['username'], 'admin')
        self.admin.invalidate_recordset()
        self.assertEqual(self.admin.name, 'Mitchell Admin B')

    def test_A21_failed_save(self):
        original = self.admin.name
        with self.host_session(host={}, ua=self.UA_ANDROID):
            self.wait_requests('updateAccount', 1)
            self.open_preferences()
            self.set_field('name', '')
            self.save_preferences()
            self.settle(2)
            self.assertTrue(self.js("!!document.querySelector('.modal .o_form_view')"))
            if not self._is_installed('hr'):
                # the Community message of the failed save (a contact needs a name); with
                # Employees the name is required in the form and the save is not attempted
                self.assertTrue(self.js("!!document.querySelector('.o_error_dialog')"))
            self.assertEqual(len(self.account_requests()), 1)
        self.assertEqual(self.admin.name, original)

    def test_A23_ios_no_wait(self):
        self.addCleanup(self.admin.write, {'name': self.admin.name})
        never = {'answers': {'updateAccount': 'never'}}
        # iOS: the save completes and the dialog closes (the page reloads) with no answer
        with self.host_session(host=never, ua=self.UA_IOS):
            self.wait_requests('updateAccount', 1)
            self.open_preferences()
            self.arm_unload_snapshot()
            self.set_field('name', 'Mitchell Admin 1')
            self.save_preferences()
            log = [e for e in self.unload_snapshot() if e['action'] == 'updateAccount']
            self.assertEqual(len(log), 2)
        # Android: the save stays unfinished until the app answers
        with self.host_session(host=never, ua=self.UA_ANDROID):
            self.wait_requests('updateAccount', 1)
            self.open_preferences()
            self.arm_unload_snapshot()
            self.set_field('name', 'Mitchell Admin 2')
            self.save_preferences()
            self.wait_requests('updateAccount', 2)
            self.settle(2)
            self.assertTrue(self.js("!!document.querySelector('.modal .o_form_view')"))
            self.assertFalse(self.js("!!sessionStorage.getItem('cwmSnapshot')"))
            pending = self.host_requests('updateAccount')[-1]
            self.answer_request(pending['id'], {'success': True})
            log = [e for e in self.unload_snapshot() if e['action'] == 'updateAccount']
            self.assertEqual(len(log), 2)

    def test_A25_picture_unreadable(self):
        with self.host_session(host={}, ua=self.UA_DESKTOP, fail_picture=True):
            self.home_ready()
            self.wait_requests('updateAvailableApps', 1)
            self.settle(2)
            self.assertEqual(self.account_requests(), [])
            self.assertGreaterEqual(len(self.console_entries('[cwm]')), 1)
            self.assertFalse(self.js("!!document.querySelector('.o_error_dialog')"))

    def test_A61_failed_update(self):
        self.addCleanup(self.admin.write, {'name': self.admin.name})
        with self.host_session(host={'answers': {'updateAccount': 'fail'}}, ua=self.UA_ANDROID):
            self.wait_requests('updateAccount', 1)
            self.settle(2)
            self.assertEqual(len(self.console_entries('[cwm]')), 1)
            self.assertFalse(
                self.js("!!document.querySelector('.o_error_dialog, .o_notification')"))
            self.open_preferences()
            self.arm_unload_snapshot()
            self.set_field('name', 'Mitchell Admin 3')
            self.save_preferences()
            log = [e for e in self.unload_snapshot() if e['action'] == 'updateAccount']
            self.assertEqual(len(log), 2)
            # the Community follow-up happened (the page came back) and nothing is shown
            self.wait("!!odoo.__WOWL_DEBUG__?.root?.env?.services?.mobile")
            self.settle()
            self.assertFalse(self.js("!!document.querySelector('.o_error_dialog, .modal')"))
        self.admin.invalidate_recordset()
        self.assertEqual(self.admin.name, 'Mitchell Admin 3')

    def test_A62_prefs_without_employees(self):
        if self._is_installed('hr'):
            raise unittest.SkipTest('the Employees application is installed')
        self.addCleanup(self.admin.write, {'name': self.admin.name})
        with self.host_session(host={}, ua=self.UA_ANDROID):
            self.wait_requests('updateAccount', 1)
            self.open_preferences()
            self.arm_unload_snapshot()
            self.set_field('name', 'Mitchell Admin 4')
            self.save_preferences()
            log = [e for e in self.unload_snapshot() if e['action'] == 'updateAccount']
            self.assertEqual(len(log), 2)
            self.assertEqual(sorted(log[1]['args']), ACCOUNT_KEYS)

    def test_A66_picture_error_on_save(self):
        self.addCleanup(self.admin.write, {'name': self.admin.name})
        with self.host_session(host={}, ua=self.UA_ANDROID):
            self.wait_requests('updateAvailableApps', 1)
            self.settle()
            self.open_preferences()
            self.fail_picture = True
            before = len(self.console_entries('[cwm]'))
            self.arm_unload_snapshot()
            self.set_field('name', 'Mitchell Admin 5')
            self.save_preferences()
            log = [e for e in self.unload_snapshot() if e['action'] == 'updateAccount']
            # only the request of the page load (made before the picture failed)
            self.assertEqual(len(log), 1)
            self.assertGreater(len(self.console_entries('[cwm]')), before)
        self.admin.invalidate_recordset()
        self.assertEqual(self.admin.name, 'Mitchell Admin 5')
