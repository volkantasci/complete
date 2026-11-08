# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of the shell, taken on demand (not part of the normal run).

Run with ``--test-tags web_shell_screens`` and ``--screenshots <dir>`` on a database that has
the demo data and the Contacts, CRM, Sales, Calendar and Project applications.
"""
import contextlib
import json
import time

from odoo.tests import HttpCase, tagged
from odoo.tests.common import ChromeBrowser, flushing_cursor

TAGS = ('-standard', 'web_shell_screens', 'post_install', '-at_install')

KEYS = {
    'Right': ('ArrowRight', 39),
    'Down': ('ArrowDown', 40),
    'Escape': ('Escape', 27),
}

CLICK_TEXT = """
(() => {
    const [selector, text] = %s;
    const el = [...document.querySelectorAll(selector)]
        .find((e) => e.textContent.trim().startsWith(text));
    if (!el) { throw new Error("no " + selector + " with text " + text); }
    el.click();
})()
"""


class ShellScreens(HttpCase):
    """Base: one browser session per test, driven with raw DevTools commands."""

    def setUp(self):
        super().setUp()
        self.admin = self.env.ref('base.user_admin')
        self.settings = self.env['res.users.settings']._find_or_create_for_user(self.admin)

    @contextlib.contextmanager
    def shell(self, url='/odoo'):
        browser = ChromeBrowser(self, headless=True)
        with self.allow_requests(browser=browser), contextlib.ExitStack() as atexit:
            atexit.enter_context(flushing_cursor(self.cr))
            atexit.callback(self._wait_remaining_requests)
            atexit.enter_context(browser.cleanup)
            self.authenticate('admin', 'admin', browser=browser)
            self.browser = browser
            self.goto(url)
            yield browser

    def goto(self, url):
        self.browser.navigate_to(self.base_url() + url, wait_stop=False)
        self.wait("!!document.querySelector('.o_web_client')")
        self.pause()

    def js(self, code):
        res = self.browser._websocket_request('Runtime.evaluate', params={
            'expression': code, 'awaitPromise': True, 'returnByValue': True,
        })
        if res.get('exceptionDetails'):
            raise AssertionError(json.dumps(res['exceptionDetails'])[:600])
        return res['result'].get('value')

    def wait(self, condition, timeout=30):
        self.assertTrue(
            self.browser._wait_ready(condition, timeout=timeout), f'never true: {condition}',
        )

    def pause(self, seconds=1.0):
        time.sleep(seconds)

    def click(self, selector):
        self.wait(f"!!document.querySelector({json.dumps(selector)})")
        self.js(f"document.querySelector({json.dumps(selector)}).click()")
        self.pause(0.5)

    def click_text(self, selector, text):
        self.wait(
            f"[...document.querySelectorAll({json.dumps(selector)})]"
            f".some((e) => e.textContent.trim().startsWith({json.dumps(text)}))"
        )
        self.js(CLICK_TEXT % json.dumps([selector, text]))
        self.pause(0.5)

    def press(self, *names):
        for name in names:
            key, code = KEYS[name]
            for kind in ('keyDown', 'keyUp'):
                self.browser._websocket_request('Input.dispatchKeyEvent', params={
                    'type': kind, 'key': key, 'code': key, 'windowsVirtualKeyCode': code,
                })
            self.pause(0.3)

    def type_char(self, char):
        for kind in ('keyDown', 'keyUp'):
            params = {
                'type': kind, 'key': char, 'code': 'Key' + char.upper(),
                'windowsVirtualKeyCode': ord(char.upper()),
            }
            if kind == 'keyDown':
                params['text'] = char
            self.browser._websocket_request('Input.dispatchKeyEvent', params=params)
        self.pause(0.8)

    def shot(self, prefix):
        self.pause(0.8)
        future = self.browser.take_screenshot(prefix)
        future.result(timeout=20)
        self.pause(0.5)

    def open_app(self, xmlid):
        self.click(f'a.o_app[data-menu-xmlid="{xmlid}"]')

    def home(self):
        self.wait("!!document.querySelector('.o_home_menu a.o_app')")

    def dark(self):
        self.settings.color_scheme = 'dark'

    def reorder(self):
        self.settings.homemenu_config = json.dumps(
            ['base.menu_administration', 'crm.crm_menu_root', 'contacts.menu_contacts'],
        )

    def more_leads(self):
        """Enough cards in the first column for the kanban to scroll."""
        stage = self.env['crm.stage'].search([], limit=1)
        self.env['crm.lead'].create([{
            'name': f'Extra opportunity {index}', 'type': 'opportunity',
            'stage_id': stage.id, 'user_id': self.admin.id,
            'expected_revenue': 1000 * index,
        } for index in range(1, 13)])

    def message(self):
        self.env['ir.config_parameter'].sudo().set_str(
            'sysadmin.message',
            '{"message": "<p><b>Maintenance:</b> the server restarts tonight at 11 pm, '
            'please save your work before then.</p>", "warning_type": "user"}',
        )


CRM = 'crm.crm_menu_root'


@tagged(*TAGS)
class TestScreensDesktop(ShellScreens):
    browser_size = '1600x900'

    def test_home(self):
        with self.shell():
            self.home()
            self.shot('s01_home_menu_')
            self.press('Right', 'Right', 'Down')
            self.shot('s02_home_keyboard_focus_')

    def test_search_palette(self):
        with self.shell():
            self.home()
            self.type_char('c')
            self.wait("!!document.querySelector('.o_command_palette')")
            self.shot('s03_home_search_palette_')

    def test_app_and_back(self):
        with self.shell():
            self.home()
            self.open_app(CRM)
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s04_app_navbar_')
            self.click('.o_navbar .o_menu_toggle')
            self.home()
            self.shot('s05_home_over_app_')
            self.press('Escape')
            self.wait("!document.querySelector('.o_home_menu')")
            self.shot('s06_back_to_app_')

    def test_reordered(self):
        self.reorder()
        with self.shell():
            self.home()
            self.shot('s09_home_reordered_')

    def test_admin_message(self):
        self.message()
        with self.shell():
            self.home()
            self.shot('s10_home_admin_message_')

    def test_preferences(self):
        with self.shell():
            self.home()
            self.click('.o_user_menu')
            self.click_text('.o-dropdown-item', 'My Preferences')
            self.wait("!!document.querySelector('.modal .o_field_widget[name=color_scheme]')")
            self.shot('s11_preferences_theme_')

    def test_user_form(self):
        with self.shell(f'/odoo/action-base.action_res_users/{self.admin.id}'):
            self.wait("!!document.querySelector('.o_form_view')")
            self.click_text('.o_notebook_headers .nav-link', 'Preferences')
            self.wait("!!document.querySelector('.o_field_widget[name=color_scheme]')")
            self.shot('s12_user_form_theme_')

    def test_dark(self):
        self.dark()
        with self.shell():
            self.home()
            self.shot('s13_home_dark_')
            self.open_app(CRM)
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s14_app_dark_')

    def test_view_switcher(self):
        with self.shell('/odoo/action-crm.crm_lead_action_pipeline'):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.click('.o_cp_switch_buttons .o_switch_view.o_list')
            self.wait("!!document.querySelector('.o_list_view')")
            self.shot('s15_view_switcher_list_')

    def test_kanban_headers(self):
        self.more_leads()
        with self.shell('/odoo/action-crm.crm_lead_action_pipeline'):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s16_kanban_header_top_')
            self.js(
                "(() => { const el = document.querySelector('.o_content');"
                " el.scrollTop = el.clientHeight; })()"
            )
            self.shot('s17_kanban_header_sticky_')


@tagged(*TAGS)
class TestScreensMobile(ShellScreens):
    browser_size = '390x844'
    touch_enabled = True

    def test_home(self):
        with self.shell():
            self.home()
            self.shot('s01_home_menu_mobile_')

    def test_burger_on_home(self):
        with self.shell():
            self.home()
            self.click('.o_mobile_menu_toggle')
            self.wait("!!document.querySelector('.o_burger_menu')")
            self.shot('s08_burger_on_home_mobile_')

    def test_search_palette(self):
        with self.shell():
            self.home()
            self.click('.o_cws_touch_search')
            self.wait("!!document.querySelector('.o_command_palette')")
            self.shot('s03_home_search_palette_mobile_')

    def test_app(self):
        with self.shell():
            self.home()
            self.open_app(CRM)
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s04_app_navbar_mobile_')
            self.click('.o_navbar .o_menu_toggle')
            self.wait("!!document.querySelector('.o_burger_menu_app, .o_sidebar_topbar')")
            self.shot('s07_mobile_app_menu_mobile_')
            self.click_text('.o_sidebar_topbar a', 'All Apps')
            self.home()
            self.shot('s05_home_over_app_mobile_')

    def test_burger_in_app(self):
        with self.shell():
            self.home()
            self.open_app(CRM)
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.click('.o_mobile_menu_toggle')
            self.wait("!!document.querySelector('.o_burger_menu')")
            self.shot('s20_burger_in_app_mobile_')

    def test_reordered(self):
        self.reorder()
        with self.shell():
            self.home()
            self.shot('s09_home_reordered_mobile_')

    def test_admin_message(self):
        self.message()
        with self.shell():
            self.home()
            self.shot('s10_home_admin_message_mobile_')

    def test_preferences(self):
        with self.shell():
            self.home()
            self.click('.o_mobile_menu_toggle')
            self.wait("!!document.querySelector('.o_burger_menu')")
            self.click_text('.o_burger_menu *', 'My Preferences')
            self.wait("!!document.querySelector('.modal .o_field_widget[name=color_scheme]')")
            self.shot('s11_preferences_theme_mobile_')

    def test_user_form(self):
        with self.shell(f'/odoo/action-base.action_res_users/{self.admin.id}'):
            self.wait("!!document.querySelector('.o_form_view')")
            self.click_text('.o_notebook_headers .nav-link', 'Preferences')
            self.wait("!!document.querySelector('.o_field_widget[name=color_scheme]')")
            self.js(
                "document.querySelector('.o_field_widget[name=color_scheme]')"
                ".scrollIntoView({block: 'center'})"
            )
            self.shot('s12_user_form_theme_mobile_')

    def test_dark(self):
        self.dark()
        with self.shell():
            self.home()
            self.shot('s13_home_dark_mobile_')
            self.open_app(CRM)
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s14_app_dark_mobile_')

    def test_kanban_headers(self):
        self.more_leads()
        with self.shell('/odoo/action-crm.crm_lead_action_pipeline'):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s16_kanban_header_top_mobile_')
            self.js(
                "(() => { const el = document.querySelector('.o_content');"
                " el.scrollTop = el.clientHeight; })()"
            )
            self.shot('s17_kanban_header_sticky_mobile_')

    def test_pivot(self):
        with self.shell('/odoo/action-crm.crm_lead_action_pipeline'):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.click('.o_cp_switch_buttons button')
            self.pause()
            self.click_text('button', 'Pivot')
            self.wait("!!document.querySelector('.o_pivot')")
            self.shot('s18_pivot_mobile_')

    def test_view_switcher_sheet(self):
        with self.shell('/odoo/action-crm.crm_lead_action_pipeline'):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.click('.o_cp_switch_buttons button')
            self.pause()
            self.shot('s19_view_switcher_mobile_')
