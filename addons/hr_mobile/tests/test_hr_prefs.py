# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import time

from odoo.addons.web_mobile.tests.mobile_host import CwmHostCase
from odoo.tests import tagged


@tagged('post_install', '-at_install')
class CwmHrPrefs(CwmHostCase):

    def setUp(self):
        super().setUp()
        self.admin = self.env.ref('base.user_admin')
        self.addCleanup(self.admin.write, {'name': self.admin.name, 'lang': self.admin.lang})
        self.env['res.lang']._activate_lang('fr_FR')

    def _wait_requests(self, count):
        self.wait(
            "(window.__cwmHostLog || []).filter((e) => e.action === 'updateAccount')"
            f".length >= {count}", timeout=30)

    def _open_preferences(self):
        self.js("document.querySelector('.o_user_menu').click()")
        self.wait("!!document.querySelector('.o-dropdown--menu .dropdown-item')")
        self.js("""[...document.querySelectorAll('.o-dropdown--menu .dropdown-item')]
            .find((e) => e.textContent.trim() === 'My Preferences').click()""")
        self.wait("!!document.querySelector('.modal .o_form_view [name=name] input')")

    def _set_name(self, value):
        self.js(f"""(() => {{
            const input = document.querySelector('.modal [name=name] input');
            input.focus();
            input.value = {value!r};
            input.dispatchEvent(new Event('input', {{bubbles: true}}));
            input.dispatchEvent(new Event('change', {{bubbles: true}}));
        }})()""")

    def _set_language(self):
        self.js("document.querySelector('.modal [name=lang] .o_select_menu_toggler').click()")
        self.wait("!!document.querySelector('.o_select_menu_item')")
        self.js("""[...document.querySelectorAll('.o_select_menu_item')]
            .find((e) => e.textContent.includes('Fran')).click()""")

    def _save(self):
        self.js("document.querySelector('.modal-footer button[name=preference_save]').click()")

    def test_A22_answer_before_reload(self):
        with self.host_session(host={'answers': {'updateAccount': 'never'}}, ua=self.UA_ANDROID):
            self._wait_requests(1)
            self._open_preferences()
            self.js("window.__cwmMarker = 'alive'")
            self._set_language()
            self._save()
            self._wait_requests(2)
            self.assertEqual(self.host_requests('updateAccount')[-1]['args']['username'], 'admin')
            time.sleep(2)
            # no answer yet: the page was not reloaded and the dialog is still there
            self.assertEqual(self.js("window.__cwmMarker"), 'alive')
            self.assertTrue(self.js("!!document.querySelector('.modal .o_form_view')"))
            self.arm_unload_snapshot()
            self.answer_request(self.host_requests('updateAccount')[-1]['id'], {'success': True})
            self.unload_snapshot()
            self.wait("!!odoo.__WOWL_DEBUG__?.root?.env?.services?.mobile")
            self.assertIsNone(self.js("window.__cwmMarker"))

    def test_A65_saved_name_with_employees(self):
        with self.host_session(host={'answers': {'updateAccount': 'never'}}, ua=self.UA_ANDROID):
            self._wait_requests(1)
            self._open_preferences()
            self.js("window.__cwmMarker = 'alive'")
            self._set_name('Mitchell Admin Hr')
            self._set_language()
            self._save()
            self._wait_requests(2)
            self.assertEqual(
                self.host_requests('updateAccount')[-1]['args']['name'], 'Mitchell Admin Hr')
            time.sleep(2)
            self.assertEqual(self.js("window.__cwmMarker"), 'alive')
            self.arm_unload_snapshot()
            self.answer_request(self.host_requests('updateAccount')[-1]['id'], {'success': True})
            self.unload_snapshot()
        self.admin.lang = 'en_US'  # the language change was saved: back to English menus
        self.admin.flush_recordset()
        # iOS app: the dialog closes without any answer, the saved name was sent
        with self.host_session(host={'answers': {'updateAccount': 'never'}}, ua=self.UA_IOS):
            self._wait_requests(1)
            self._open_preferences()
            self.arm_unload_snapshot()
            self._set_name('Mitchell Admin Ios')
            self._save()
            log = [e for e in self.unload_snapshot() if e['action'] == 'updateAccount']
            self.assertEqual(log[-1]['args']['name'], 'Mitchell Admin Ios')
        self.admin.invalidate_recordset()
        self.assertEqual(self.admin.name, 'Mitchell Admin Ios')
