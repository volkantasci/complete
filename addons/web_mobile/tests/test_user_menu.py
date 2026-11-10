# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import base64
import json

from odoo.tests import tagged

from .mobile_host import CwmHostCase

SHORTCUT = 'Add to Home Screen'
SWITCH = 'Switch/Add Account'
LOG_OUT = 'Log out'
HOME_NOTICE = "Open an app first: the main menu can't be pinned to your home screen."
NO_ICON_NOTICE = "This app has no image icon, so it can't be pinned to your home screen."
NOTE = '.o_notification_manager .o_notification'

MAIN_PLUGINS = [
    {'name': 'addHomeShortcut', 'action': 'cwm_shortcut'},
    {'name': 'switchAccount', 'action': 'cwm_switch'},
]


class CwmUserMenuCase(CwmHostCase):

    def _is_installed(self, name):
        return bool(self.env['ir.module.module'].search(
            [('name', '=', name), ('state', '=', 'installed')], limit=1))

    def _entries(self, mobile):
        """Open the user menu (desktop) or the user panel (mobile); return the entry texts."""
        if mobile:
            self.js("document.querySelector('.o_mobile_menu_toggle').click()")
            sel = '.o_user_menu_mobile a'
        else:
            self.js("document.querySelector('.o_user_menu').click()")
            sel = '.o-dropdown--menu .dropdown-item'
        self.wait(f"document.querySelectorAll({json.dumps(sel)}).length > 0")
        self._entry_selector = sel
        return self.js(
            f"[...document.querySelectorAll({json.dumps(sel)})].map((e) => e.textContent.trim())")

    def _choose(self, text):
        self.js(f"""[...document.querySelectorAll({json.dumps(self._entry_selector)})]
            .find((e) => e.textContent.trim() === {json.dumps(text)}).click()""")

    def _select_app(self, menu_id):
        self.js(f"odoo.__WOWL_DEBUG__.root.env.services.menu.selectMenu({int(menu_id)})")
        self.wait(
            f"odoo.__WOWL_DEBUG__.root.env.services.menu.getCurrentApp()?.id === {int(menu_id)}")
        self.wait("!!document.querySelector('.o_action')")

    def _notes(self):
        return self.js(
            f"[...document.querySelectorAll({json.dumps(NOTE)})].map((e) => e.textContent.trim())")


MAIN_PLUGINS_HOST = {'plugins': MAIN_PLUGINS}


@tagged('post_install', '-at_install')
class TestUserMenu(CwmUserMenuCase):

    def test_A5_features_follow_list(self):
        if not self._is_installed('crm'):
            self.skipTest('crm is not installed')
        cases = [
            ([MAIN_PLUGINS[1]], [SWITCH], [SHORTCUT, LOG_OUT]),
            ([MAIN_PLUGINS[0]], [SHORTCUT, LOG_OUT], [SWITCH]),
        ]
        for mobile in (False, True):
            for plugins, present, absent in cases:
                with self.subTest(mobile=mobile, plugins=[p['name'] for p in plugins]):
                    with self.host_session('/odoo/crm', host={'plugins': plugins}, mobile=mobile):
                        texts = self._entries(mobile)
                        for text in present:
                            self.assertIn(text, texts)
                        for text in absent:
                            self.assertNotIn(text, texts)
            with self.subTest(mobile=mobile, case='both'):
                with self.host_session('/odoo/crm', host=MAIN_PLUGINS_HOST, mobile=mobile):
                    texts = self._entries(mobile)
                    self.assertEqual(texts[-2:], [SHORTCUT, SWITCH])
                    self.assertNotIn(LOG_OUT, texts)
                    self.assertIn('My Preferences', texts)
                    self.assertLess(texts.index('My Preferences'), texts.index(SHORTCUT))

    def test_A10_no_host_keeps_log_out(self):
        if not self._is_installed('crm'):
            self.skipTest('crm is not installed')
        for mobile in self.cwm_both_forms():
            with self.host_session('/odoo/crm', host=None, mobile=mobile,
                                   ua=self.UA_ANDROID if mobile else self.UA_DESKTOP):
                texts = self._entries(mobile)
                self.assertEqual(texts[-1], LOG_OUT)
                self.assertNotIn(SHORTCUT, texts)
                self.assertNotIn(SWITCH, texts)

    def test_A11_shortcut_in_crm(self):
        if not self._is_installed('crm'):
            self.skipTest('crm is not installed')
        menu = self.env.ref('crm.crm_menu_root')
        data_url = self.env['ir.ui.menu'].load_web_menus(False)[menu.id]['webIconData']
        expected = base64.b64decode(data_url.split(',', 1)[1])
        with self.host_session('/odoo/crm', host=MAIN_PLUGINS_HOST, mobile=True):
            self.wait("!!document.querySelector('.o_action')")
            title = self.js('document.title')
            url = self.js('window.location.href')
            self._entries(True)
            self._choose(SHORTCUT)
            self.wait("window.__cwmHostLog.some((e) => e.action === 'cwm_shortcut')")
            args = self.cwm_expect_one(self.host_requests('cwm_shortcut'))['args']
            self.assertEqual(set(args), {'title', 'shortcut_url', 'web_icon'})
            self.assertEqual(args['title'], title)
            self.assertEqual(args['shortcut_url'], url)
            icon = base64.b64decode(args['web_icon'])
            self.assertTrue(icon.startswith(b'\x89PNG'))
            self.assertEqual(icon, expected)
            self.assertFalse(args['web_icon'].startswith('data:'))
            self.assertEqual(self.js('window.location.href'), url)
            self.assertEqual(self.js('document.title'), title)

    def test_A12_shortcut_on_home_menu(self):
        for mobile in self.cwm_both_forms():
            with self.host_session('/odoo', host=MAIN_PLUGINS_HOST, mobile=mobile):
                self.wait("odoo.__WOWL_DEBUG__.root.env.services.home_menu.hasHomeMenu")
                self._entries(mobile)
                self._choose(SHORTCUT)
                self.wait(f"document.querySelectorAll({json.dumps(NOTE)}).length > 0")
                self.assertEqual(self._notes(), [HOME_NOTICE])
                bar = json.dumps(NOTE + ' .o_notification_bar.bg-warning')
                self.assertEqual(self.js(f"document.querySelectorAll({bar}).length"), 1)
                self.assertEqual(self.host_requests('cwm_shortcut'), [])

    def test_A13_glyph_app(self):
        action = self.env['ir.actions.act_window'].create({
            'name': 'Cwm scratch', 'res_model': 'res.partner', 'view_mode': 'list,form',
        })
        glyph = self.env['ir.ui.menu'].create({
            'name': 'Cwm glyph', 'action': f'ir.actions.act_window,{action.id}',
            'web_icon': 'fa fa-rocket,#fff,#333',
        })
        bare = self.env['ir.ui.menu'].create({
            'name': 'Cwm bare', 'action': f'ir.actions.act_window,{action.id}',
        })
        for menu in (glyph, bare):
            for mobile in (False, True):
                with self.subTest(menu=menu.name, mobile=mobile):
                    with self.host_session('/odoo', host=MAIN_PLUGINS_HOST, mobile=mobile):
                        self._select_app(menu.id)
                        url = self.js('window.location.href')
                        self._entries(mobile)
                        self._choose(SHORTCUT)
                        self.wait(f"document.querySelectorAll({json.dumps(NOTE)}).length > 0")
                        self.assertEqual(self._notes(), [NO_ICON_NOTICE])
                        self.assertEqual(
                            self.js("document.querySelectorAll('.o_error_dialog').length"), 0)
                        self.assertEqual(self.host_requests('cwm_shortcut'), [])
                        self.assertEqual(self.js('window.location.href'), url)

    def test_A14_switch_account(self):
        if not self._is_installed('crm'):
            self.skipTest('crm is not installed')
        for mobile in self.cwm_both_forms():
            with self.host_session('/odoo/crm', host=MAIN_PLUGINS_HOST, mobile=mobile):
                self.wait("!!document.querySelector('.o_action')")
                url = self.js('window.location.href')
                self._entries(mobile)
                self._choose(SWITCH)
                self.wait("window.__cwmHostLog.some((e) => e.action === 'cwm_switch')")
                only = self.cwm_expect_one(self.host_requests('cwm_switch'))
                self.assertEqual(only['args'], {})
                self.assertEqual(self.js('window.location.href'), url)
                info = self.js("""fetch('/web/session/get_session_info', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({jsonrpc: '2.0', method: 'call', params: {}}),
                }).then((r) => r.json()).then((j) => j.result && j.result.uid)""")
                self.assertEqual(info, self.env.ref('base.user_admin').id)
