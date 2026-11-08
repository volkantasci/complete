# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import re
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from http import HTTPStatus
from unittest.mock import Mock, patch

from odoo.addons.web_enterprise.models import ir_http as ir_http_module
from odoo.tests.common import HttpCase, TransactionCase, new_test_user, tagged

MESSAGE_KEY = 'sysadmin.message'
SET_COOKIE = 'Set-Cookie'


def fake_request(cookies=None):
    """A stand-in for the current request that only carries cookies.

    The mock helpers shipped with the Community build live in modules this
    module does not depend on (they need website routing), so the decision
    method is exercised against a minimal replacement of the request.
    """
    return patch.object(
        ir_http_module, 'request', Mock(httprequest=Mock(cookies=cookies or {})),
    )


class TestColorSchemeDecision(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = new_test_user(cls.env, login='cws_http_u1', groups='base.group_user')
        cls.portal = new_test_user(cls.env, login='cws_http_p1', groups='base.group_portal')

    def _decide(self, user, cookies=None):
        with fake_request(cookies):
            return self.env['ir.http'].with_user(user).color_scheme()

    def _set(self, user, scheme):
        self.env['res.users.settings']._find_or_create_for_user(user).color_scheme = scheme

    def test_A55_server_decision(self):
        self._set(self.user, 'dark')
        self.assertEqual(self._decide(self.user, {'color_scheme': 'light'}), 'dark')
        self._set(self.user, 'light')
        self.assertEqual(self._decide(self.user, {'color_scheme': 'dark'}), 'light')
        self._set(self.user, 'system')
        self.assertEqual(self._decide(self.user, {'color_scheme': 'dark'}), 'dark')
        self.assertEqual(self._decide(self.user), 'light')
        self.assertEqual(self._decide(self.user, {'color_scheme': 'purple'}), 'light')
        public = self.env.ref('base.public_user')
        self.assertEqual(self._decide(public, {'color_scheme': 'dark'}), 'light')

    def test_A81_portal_keeps_stored_scheme(self):
        self.env['res.users.settings'].search([('user_id', '=', self.portal.id)]).unlink()
        self.assertEqual(self._decide(self.portal, {'color_scheme': 'dark'}), 'dark')
        self.assertEqual(self._decide(self.portal), 'light')
        # Reading the decision never creates a settings record.
        self.assertFalse(self.portal.sudo().res_users_settings_ids)
        self._set(self.portal, 'dark')
        self.assertEqual(self._decide(self.portal, {'color_scheme': 'light'}), 'dark')
        public = self.env.ref('base.public_user')
        self.assertEqual(self._decide(public, {'color_scheme': 'dark'}), 'light')

    def test_A81b_admin_sets_portal_scheme(self):
        self.env['res.users.settings'].search([('user_id', '=', self.portal.id)]).unlink()
        admin = new_test_user(self.env, login='cws_http_a1', groups='base.group_system')
        self.portal.with_user(admin).write({'color_scheme': 'dark'})
        self.assertEqual(self._decide(self.portal), 'dark')


class TestAdminMessage(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.params = cls.env['ir.config_parameter'].sudo()

    def _message(self, value):
        self.params.set_str(MESSAGE_KEY, value)
        return self.env['ir.http']._cws_admin_message()

    def test_A46_invalid_parameter_skipped(self):
        with self.assertLogs('odoo.addons.web_enterprise', 'ERROR'):
            self.assertIsNone(self._message('not json'))

    def test_A46b_wrong_shape_skipped(self):
        for value in ('["a"]', '"text"'):
            with self.assertLogs('odoo.addons.web_enterprise', 'ERROR'):
                self.assertIsNone(self._message(value))

    def test_A46c_empty_parameter_means_no_message(self):
        self.assertIsNone(self._message(False))
        self.assertIsNone(self._message(''))

    def test_A47_dangerous_markup_removed(self):
        value = self._message(
            '{"message": "<p><script>alert(1)</script><b>x</b></p>", "warning_type": "user"}',
        )
        self.assertNotIn('<script', value['message'])
        self.assertIn('<b>x</b>', value['message'])

    def test_A46d_missing_message_and_unknown_type_are_skipped(self):
        for value in (
            '{"warning_type": "other"}',
            '{"message": "x"}',
            '{"message": "x", "warning_type": "other"}',
            '{"message": 5, "warning_type": "user"}',
            '5',
        ):
            with self.assertLogs('odoo.addons.web_enterprise', 'ERROR'):
                self.assertIsNone(self._message(value), value)

    def test_A46e_empty_text_with_valid_audience_passes(self):
        value = self._message('{"message": "", "warning_type": "admin"}')
        self.assertEqual(value, {'message': '', 'warning_type': 'admin'})


@tagged('post_install', '-at_install')
class TestSessionInfo(HttpCase):
    def _session_info(self, user):
        self.authenticate(user.login, user.login)
        return self.make_jsonrpc_request('/web/session/get_session_info', {})

    def test_A45_message_for_internal_only(self):
        internal = new_test_user(self.env, login='cws_si_u1', groups='base.group_user')
        portal = new_test_user(self.env, login='cws_si_p1', groups='base.group_portal')
        self.env['ir.config_parameter'].sudo().set_str(
            MESSAGE_KEY,
            '{"message": "<p><b>Maintenance:</b> tonight</p>", "warning_type": "user"}',
        )
        info = self._session_info(internal)
        self.assertIn('<b>Maintenance:</b>', info['sysadmin_message']['message'])
        self.assertEqual(info['sysadmin_message']['warning_type'], 'user')
        self.assertNotIn('sysadmin_message', self._session_info(portal))

    def test_A45_wrong_shapes_give_no_key(self):
        internal = new_test_user(self.env, login='cws_si_u3', groups='base.group_user')
        for value in (
            '["a"]', '5', '{"warning_type": "user"}',
            '{"message": "x", "warning_type": "other"}',
        ):
            self.env['ir.config_parameter'].sudo().set_str(MESSAGE_KEY, value)
            with self.assertLogs('odoo.addons.web_enterprise', 'ERROR') as logs:
                info = self._session_info(internal)
            self.assertNotIn('sysadmin_message', info, value)
            self.assertEqual(len(logs.records), 1, value)

    def test_no_message_without_parameter(self):
        internal = new_test_user(self.env, login='cws_si_u2', groups='base.group_user')
        self.assertNotIn('sysadmin_message', self._session_info(internal))


@tagged('post_install', '-at_install')
class TestWebClientCookie(HttpCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.light = new_test_user(cls.env, login='cws_wc_light', groups='base.group_user')
        cls.dark = new_test_user(cls.env, login='cws_wc_dark', groups='base.group_user')
        cls.env['res.users.settings']._find_or_create_for_user(cls.dark).color_scheme = 'dark'

    def _scheme_cookies(self, response):
        return [
            value for value in response.raw.headers.getlist(SET_COOKIE)
            if value.startswith('color_scheme=')
        ]

    def test_A77_web_client_writes_cookie(self):
        self.authenticate('cws_wc_light', 'cws_wc_light')
        response = self.url_open('/odoo')
        self.assertEqual(response.status_code, 200)
        (cookie,) = self._scheme_cookies(response)
        self.assertTrue(cookie.startswith('color_scheme=light'), cookie)
        self.assertIn('Max-Age=31536000', cookie)
        self.assertIn('Expires=', cookie)

        self.authenticate('cws_wc_dark', 'cws_wc_dark')
        response = self.url_open('/odoo')
        (cookie,) = self._scheme_cookies(response)
        self.assertTrue(cookie.startswith('color_scheme=dark'), cookie)

        # An unknown sub-address is still answered by the web client page.
        response = self.url_open('/odoo/action-does-not-exist')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self._scheme_cookies(response)), 1)

        # Not logged in: the redirect to the login page carries no cookie.
        self.logout()
        response = self.url_open('/odoo', allow_redirects=False)
        self.assertEqual(response.status_code, HTTPStatus.SEE_OTHER)
        self.assertFalse(self._scheme_cookies(response))

    def test_A88_server_cookie_lasts_one_year(self):
        user = new_test_user(self.env, login='cws_wc_system', groups='base.group_user')
        self.env['res.users.settings']._find_or_create_for_user(user).color_scheme = 'system'
        self.authenticate('cws_wc_system', 'cws_wc_system')
        self.opener.cookies.pop('color_scheme', None)
        response = self.url_open('/odoo')
        (cookie,) = self._scheme_cookies(response)
        self.assertIn('Max-Age=31536000', cookie)
        expires = parsedate_to_datetime(re.search(r'Expires=([^;]+)', cookie)[1])
        target = datetime.now(UTC) + timedelta(days=365)
        self.assertLess(abs(expires - target), timedelta(days=1))
        self.assertEqual(self.opener.cookies.get('color_scheme'), 'light')
        self.url_open('/odoo')
        self.assertEqual(self.opener.cookies.get('color_scheme'), 'light')
        # A stored "dark" is written back, so the browser has no reason to reload.
        for stored in self.opener.cookies:
            if stored.name == 'color_scheme':
                stored.value = 'dark'
        response = self.url_open('/odoo')
        (cookie,) = self._scheme_cookies(response)
        self.assertTrue(cookie.startswith('color_scheme=dark'), cookie)
        self.assertIn('Max-Age=31536000', cookie)

    def test_A56_first_page_sets_cookie(self):
        self.authenticate('cws_wc_light', 'cws_wc_light')
        self.url_open('/odoo')
        self.assertEqual(self.opener.cookies.get('color_scheme'), 'light')
        self.authenticate('cws_wc_dark', 'cws_wc_dark')
        self.url_open('/odoo')
        self.assertEqual(self.opener.cookies.get('color_scheme'), 'dark')

    def test_A60_logout_expires_cookie(self):
        self.authenticate('cws_wc_dark', 'cws_wc_dark')
        self.url_open('/odoo')
        response = self.url_open(
            '/web/session/logout',
            data={'csrf_token': self.csrf_token()},
            allow_redirects=False,
        )
        cookies = self._scheme_cookies(response)
        self.assertEqual(len(cookies), 1)
        self.assertIn('Max-Age=0', cookies[0])

    def test_A61_browser_chrome_colour(self):
        self.authenticate('cws_wc_light', 'cws_wc_light')
        html = self.url_open('/odoo').text
        self.assertIn('name="theme-color" content="#71639e"', html)
        self.assertNotIn('web.assets_web_dark', html)
        self.authenticate('cws_wc_dark', 'cws_wc_dark')
        html = self.url_open('/odoo').text
        self.assertIn('name="theme-color" content="#25262b"', html)
        self.assertIn('web.assets_web_dark', html)
