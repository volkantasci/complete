# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from lxml import etree
from odoo.tests.common import TransactionCase, new_test_user, tagged


@tagged('post_install', '-at_install')
class TestUserSettings(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = new_test_user(cls.env, login='cws_u1', groups='base.group_user')
        cls.settings = cls.env['res.users.settings']._find_or_create_for_user(cls.user)

    def test_A51_default_and_allowed_values(self):
        self.assertEqual(self.settings.color_scheme, 'system')
        for value in ('light', 'dark'):
            self.settings.color_scheme = value
            self.settings.invalidate_recordset()
            self.assertEqual(self.settings.color_scheme, value)
        with self.assertRaises(ValueError):
            self.settings.color_scheme = 'purple'

    def test_A52_empty_write_is_ignored(self):
        self.settings.color_scheme = 'dark'
        for empty in (False, ''):
            self.settings.write({'color_scheme': empty, 'homemenu_config': '["a"]'})
            self.assertEqual(self.settings.color_scheme, 'dark')
            self.assertEqual(self.settings.homemenu_config, '["a"]')
            self.settings.set_res_users_settings({'color_scheme': empty})
            self.assertEqual(self.settings.color_scheme, 'dark')
        # An empty value on create falls back to the default.
        other = new_test_user(self.env, login='cws_u2', groups='base.group_user')
        created = self.env['res.users.settings'].search([('user_id', '=', other.id)])
        created.unlink()
        created = self.env['res.users.settings'].create(
            {'user_id': other.id, 'color_scheme': False},
        )
        self.assertEqual(created.color_scheme, 'system')

    def test_A53_user_changes_own_scheme(self):
        self.user.with_user(self.user).write({'color_scheme': 'dark'})
        self.settings.invalidate_recordset()
        self.assertEqual(self.settings.color_scheme, 'dark')

    def test_A38_tile_order_on_own_settings(self):
        user = new_test_user(self.env, login='cws_u3', groups='base.group_user')
        self.env['res.users.settings'].search([('user_id', '=', user.id)]).unlink()
        Settings = self.env['res.users.settings']
        settings = Settings.with_user(user)._find_or_create_for_user(user)
        settings.set_res_users_settings({'homemenu_config': '["base.menu_management"]'})
        self.assertEqual(Settings.search_count([('user_id', '=', user.id)]), 1)
        self.assertEqual(settings.homemenu_config, '["base.menu_management"]')

    def test_A54_theme_field_in_both_forms(self):
        for view_ref in ('base.view_users_form_simple_modif', 'base.view_users_form'):
            view = self.env.ref(view_ref)
            arch = self.env['res.users'].get_views([(view.id, 'form')])['views']['form']['arch']
            tree = etree.fromstring(arch)
            nodes = tree.xpath("//group[@name='other_preferences']/field[@name='color_scheme']")
            self.assertEqual(len(nodes), 1, view_ref)
            self.assertEqual(nodes[0].get('widget'), 'radio')
            self.assertEqual(nodes[0].get('string'), 'Theme')
            # When the mail module adds its own field to the group, Theme comes first.
            names = tree.xpath("//group[@name='other_preferences']/field/@name")
            if 'notification_type' in names:
                self.assertLess(
                    names.index('color_scheme'), names.index('notification_type'), view_ref,
                )

    def test_session_carries_both_settings(self):
        formatted = self.settings._res_users_settings_format()
        self.assertIn('homemenu_config', formatted)
        self.assertIn('color_scheme', formatted)
