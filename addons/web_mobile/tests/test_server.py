# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import json
from unittest.mock import patch

import odoo
from odoo.tests.common import HttpCase, tagged


@tagged('post_install', '-at_install')
class CwmServerRoutes(HttpCase):
    def _rpc(self, path, params=None, rpc_id='7'):
        response = self.url_open(
            path,
            data=json.dumps({
                'jsonrpc': '2.0', 'id': rpc_id, 'method': 'call', 'params': params or {},
            }),
            headers={'Content-Type': 'application/json'},
        )
        self.assertEqual(response.status_code, 200)
        return response.json()

    def _login_params(self, password='admin', db=None):
        return {'db': db or self.env.cr.dbname, 'login': 'admin', 'password': password}

    def _assert_error(self, body, name):
        self.assertEqual(set(body), {'jsonrpc', 'id', 'error'})
        self.assertEqual(set(body['error']), {'code', 'message', 'data'})
        self.assertEqual(body['error']['data']['name'], name)

    def _assert_picture(self, uid):
        response = self.url_open(f'/web/image?model=res.users&field=image_medium&id={uid}')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers['Content-Type'].startswith('image/'))

    def test_A24_medium_image(self):
        admin = self.env.ref('base.user_admin')
        for record in (admin, admin.partner_id):
            self.assertEqual(record.image_medium, record.avatar_128)
        field = self.env['res.partner']._fields['image_medium']
        self.assertFalse(field.store)
        self.assertTrue(field.readonly)
        self.env.cr.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'res_partner' AND column_name = 'image_medium'",
        )
        self.assertFalse(self.env.cr.fetchone())
        self.authenticate('admin', 'admin')
        self._assert_picture(admin.id)

    def test_A47_version_info(self):
        body = self._rpc('/web/webclient/version_info')
        self.assertEqual(set(body), {'jsonrpc', 'id', 'result'})
        self.assertEqual(body['id'], '7')
        info = body['result']['server_version_info']
        self.assertEqual(info, list(odoo.release.version_info))
        self.assertTrue(info)
        self.assertEqual(info[-1], '')
        self.authenticate('admin', 'admin')
        session = self._rpc('/web/session/get_session_info')
        self.assertEqual(session['result']['server_version_info'], info)

    def test_A48_database_list(self):
        body = self._rpc('/web/database/list')
        self.assertEqual(set(body), {'jsonrpc', 'id', 'result'})
        self.assertIn(self.env.cr.dbname, body['result'])
        with patch.dict(odoo.tools.config.options, {'list_db': False}):
            body = self._rpc('/web/database/list')
        self._assert_error(body, 'odoo.exceptions.AccessDenied')

    def test_A49_authenticate(self):
        db = self.env.cr.dbname
        body = self._rpc('/web/session/authenticate', self._login_params())
        self.assertEqual(set(body), {'jsonrpc', 'id', 'result'})
        result = body['result']
        for key in ('uid', 'username', 'name', 'db'):
            self.assertIn(key, result)
        self.assertEqual(result['username'], 'admin')
        self.assertEqual(result['db'], db)
        self.assertTrue(self.opener.cookies.get('session_id'))
        body = self._rpc('/web/session/authenticate', self._login_params('nope'))
        self._assert_error(body, 'odoo.exceptions.AccessDenied')
        body = self._rpc('/web/session/authenticate', self._login_params(db='cwm_no_such_db'))
        self._assert_error(body, 'odoo.exceptions.AccessError')

    def test_A50_session_resume_and_picture(self):
        auth = self._rpc('/web/session/authenticate', self._login_params())
        body = self._rpc('/web/session/get_session_info')
        for key in ('uid', 'username', 'db'):
            self.assertIn(key, body['result'])
        self.assertEqual(body['result']['uid'], auth['result']['uid'])
        self._assert_picture(auth['result']['uid'])

    def test_view_record(self):
        view = self.env.ref('web_mobile.view_users_form_simple_modif')
        self.assertEqual(view.inherit_id, self.env.ref('base.view_users_form_simple_modif'))
        hr = self.env['ir.module.module'].search([('name', '=', 'hr'), ('state', '=', 'installed')])
        if hr:
            hr_view = self.env.ref('hr.res_users_view_form_preferences')
            arch = self.env['res.users'].get_view(hr_view.id)['arch']
            self.assertIn('js_class="hr_user_preferences_form"', arch)
        else:
            base_view = self.env.ref('base.view_users_form_simple_modif')
            arch = self.env['res.users'].get_view(base_view.id)['arch']
            self.assertIn('js_class="cwm_account_prefs_form"', arch)
