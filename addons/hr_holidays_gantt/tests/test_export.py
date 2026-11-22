# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import csv
import io
import json
from datetime import date

from odoo.tests import tagged
from odoo.tests.common import HttpCase

from . import time_off_fixtures as fx

# the fields the gear's Export item sends (static/src/time_off_cog_items.js, R19)
EXPORT_FIELDS = [
    {'name': 'id', 'label': 'External ID'},
    {'name': 'employee_id', 'label': 'Employee', 'store': True, 'type': 'many2one'},
    {'name': 'work_entry_type_id/id', 'label': 'Type', 'store': True, 'type': 'many2one'},
    {'name': 'request_date_from', 'label': 'Start', 'store': True, 'type': 'date'},
    {'name': 'request_date_to', 'label': 'End', 'store': True, 'type': 'date'},
]


@tagged('post_install', '-at_install')
class TestTimeOffExport(HttpCase):

    def test_a22_export_columns_and_order(self):
        """The five columns, one header line, latest start first, external identifiers made."""
        fx.make_role_users(self.env)
        peer = self.env['hr.employee'].search([('name', '=', fx.PEER_NAME)])
        sick = fx.find_type(self.env, 'STO')
        other = fx.find_type(self.env, 'UN')
        early = fx.make_leave(self.env, peer, sick, date(2026, 11, 16), date(2026, 11, 17))
        late = fx.make_leave(self.env, peer, other, date(2026, 11, 19))
        self.env.flush_all()
        self.assertFalse(self.env['ir.model.data'].search([
            ('model', '=', 'hr.leave'), ('res_id', 'in', (early | late).ids)]))
        self.authenticate('admin', 'admin')
        payload = {
            'import_compat': True,
            'context': {},
            'domain': [('employee_id', '=', peer.id)],
            'fields': EXPORT_FIELDS,
            'groupby': [],
            'ids': False,
            'model': 'hr.leave',
        }
        response = self.url_open(
            '/web/export/csv',
            data={'data': json.dumps(payload), 'csrf_token': self.csrf_token()})
        response.raise_for_status()
        rows = list(csv.reader(io.StringIO(response.content.decode())))
        self.assertEqual(
            rows[0],
            ['id', 'employee_id', 'work_entry_type_id/id', 'request_date_from', 'request_date_to'])
        self.assertEqual(len(rows), 3, 'one header line and the two requests')
        self.assertEqual(
            [(row[1], row[3], row[4]) for row in rows[1:]],
            [(peer.name, '2026-11-19', '2026-11-19'), (peer.name, '2026-11-16', '2026-11-17')])
        # the identifiers were created by the export, and name the request and its type
        for row, leave in zip(rows[1:], late | early, strict=True):
            self.assertEqual(self.env.ref(row[0]), leave)
            self.assertEqual(self.env.ref(row[2]), leave.work_entry_type_id)
