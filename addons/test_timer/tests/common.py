# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase, new_test_user


class TimerCase(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.u1 = new_test_user(cls.env, login='timer_u1', groups='base.group_user')
        cls.u2 = new_test_user(cls.env, login='timer_u2', groups='base.group_user')
        cls.admin = cls.env.ref('base.user_admin')
        cls.portal = new_test_user(cls.env, login='timer_portal', groups='base.group_portal')
        Doc = cls.env['timer.test']
        cls.doc_a = Doc.create({'name': 'A'})
        cls.doc_b = Doc.create({'name': 'B'})
        cls.doc_c = Doc.create({'name': 'C'})

    def timer_of(self, record, user):
        return self.env['timer.timer'].sudo().search([
            ('res_model', '=', record._name),
            ('res_id', '=', record.id),
            ('user_id', '=', user.id),
        ])
