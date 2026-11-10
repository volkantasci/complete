# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import re

from odoo.tests.common import HttpCase, new_test_user, tagged

DARK_CHROME = '#242733'
PRIMARY = '#714b67'


def _meta(html, name):
    """Return the contents of every meta tag with the given name."""
    pattern = f'<meta name="{re.escape(name)}" content="([^"]*)"'
    return re.findall(pattern, html)


@tagged('post_install', '-at_install')
class TestThemeHttp(HttpCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        for login, scheme in (
            ('cws_th_dark', 'dark'), ('cws_th_light', 'light'), ('cws_th_system', 'system'),
        ):
            user = new_test_user(cls.env, login=login, groups='base.group_user')
            cls.env['res.users.settings']._find_or_create_for_user(user).color_scheme = scheme

    def _page(self, login, url='/odoo', cookies=None):
        self.authenticate(login, login)
        self.opener.cookies.pop('color_scheme', None)
        for key, value in (cookies or {}).items():
            self.opener.cookies.set(key, value)
        return self.url_open(url).text

    def test_A18_chrome_colour(self):
        chrome = _meta(self._page('cws_th_dark'), 'theme-color')
        self.assertEqual([c.lower() for c in chrome], [DARK_CHROME])
        chrome = _meta(self._page('cws_th_light'), 'theme-color')
        self.assertEqual([c.lower() for c in chrome], [PRIMARY])
        page = self._page('cws_th_system', cookies={'color_scheme': 'dark'})
        self.assertEqual([c.lower() for c in _meta(page, 'theme-color')], [DARK_CHROME])

    def test_A127_declared_scheme(self):
        self.assertEqual(_meta(self._page('cws_th_dark'), 'color-scheme'), ['dark'])
        self.assertEqual(_meta(self._page('cws_th_light'), 'color-scheme'), ['light'])
        page = self._page('cws_th_system', cookies={'color_scheme': 'dark'})
        self.assertEqual(_meta(page, 'color-scheme'), ['dark'])

    def test_A127_login_page_is_light(self):
        self.opener.cookies.set('color_scheme', 'dark')
        html = self.url_open('/web/login').text
        self.assertEqual(_meta(html, 'color-scheme'), ['light'])

    def test_A127_offline_page_declares_scheme(self):
        # the offline page paints itself dark from the cookie, so it declares dark then
        self.opener.cookies.set('color_scheme', 'dark')
        html = self.url_open('/odoo/offline').text
        self.assertEqual(_meta(html, 'color-scheme'), ['dark'])
        self.opener.cookies.set('color_scheme', 'light')
        html = self.url_open('/odoo/offline').text
        self.assertEqual(_meta(html, 'color-scheme'), ['light'])
