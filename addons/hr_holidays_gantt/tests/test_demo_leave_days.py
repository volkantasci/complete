# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""On-demand check of the Community's Time Off demo leaves (the table of acceptance.md, "Setup").

It is tagged ``hr_holidays_gantt_demo_check`` and ``-standard``: no normal run picks it up.
Run it against a database created with demo data while the server's clock read
2026-11-11T10:00:00 UTC (see ``docs/modules/time_off_gantt.md``, "Verifying with demo data"):
``odoo -d DB --test-tags hr_holidays_gantt_demo_check --stop-after-init``. It is skipped when
the database holds no Time Off demo data. It lists every leave of the six employees at INFO
(one line, prefix ``DEMO-LEAVE``) and changes nothing.
"""

import logging
import unittest
from collections import defaultdict
from zoneinfo import ZoneInfo

from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from . import time_off_fixtures as fx

_logger = logging.getLogger(__name__)

DEMO_LEAVE_XMLID = 'hr_holidays.hr_holidays_cl'


@tagged('post_install', '-at_install', '-standard', 'hr_holidays_gantt_demo_check')
class TestDemoLeaveDays(TransactionCase):
    """Days, types and states of the demo leaves, and Anita Oliver's allocation."""

    def setUp(self):
        super().setUp()
        if not self.env.ref(DEMO_LEAVE_XMLID, raise_if_not_found=False):
            raise unittest.SkipTest('the database has no Time Off demo data')

    def _employee(self, name):
        if name == 'Mitchell Admin':
            admin = self.env.ref('base.user_admin')
            return self.env['hr.employee'].search([('user_id', '=', admin.id)], limit=1)
        return self.env['hr.employee'].search([('name', '=', name)], limit=1)

    def _leaves(self, employee):
        """(first day, last day, request) of every request of ``employee``, days in Brussels."""
        zone = ZoneInfo(fx.TZ)
        found = self.env['hr.leave'].with_context(active_test=False).search(
            [('employee_id', '=', employee.id)], order='date_from')
        return [(
            leave.date_from.replace(tzinfo=ZoneInfo('UTC')).astimezone(zone).date(),
            leave.date_to.replace(tzinfo=ZoneInfo('UTC')).astimezone(zone).date(),
            leave) for leave in found]

    def test_demo_leave_days(self):
        for name, expected in fx.DEMO_LEAVES.items():
            employee = self._employee(name)
            self.assertTrue(employee, name)
            found = self._leaves(employee)
            for first, last, leave in found:
                leave_type = leave.work_entry_type_id
                _logger.info(
                    'DEMO-LEAVE %s | %s | %s | %s | colour %s | %s | %s to %s (%s days)',
                    name, leave_type.name, leave_type.display_code,
                    leave_type.country_id.code or 'no country', leave_type.color,
                    leave.state, first, last, leave.number_of_days)
            self.assertEqual(
                [(leave.work_entry_type_id.display_code, first, last)
                 for first, last, leave in found],
                sorted(
                    [(fx.find_type(self.env, key).display_code, first, last)
                     for key, first, last in expected],
                    key=lambda entry: entry[1]),
                f"{name}'s leaves")
            for _first, _last, leave in found:
                self.assertEqual(leave.state, 'validate', f'{name}: {leave.display_name}')
                self.assertFalse(leave.work_entry_type_id.country_id, f'{name}: a generic type')

    def test_anita_oliver_allocation(self):
        anita = self._employee('Anita Oliver')
        pto = fx.find_type(self.env, 'PTO')
        allocations = self.env['hr.leave.allocation'].with_context(active_test=False).search([
            ('employee_id', '=', anita.id), ('work_entry_type_id', '=', pto.id),
            ('state', '=', 'validate')])
        granted = sum(allocations.mapped('number_of_days'))
        taken = defaultdict(float)
        for _first, _last, leave in self._leaves(anita):
            if leave.work_entry_type_id == pto and leave.state == 'validate':
                taken['days'] += leave.number_of_days
        _logger.info(
            'DEMO-LEAVE Anita Oliver | allocation of %s: %s days, %s taken, %s left',
            pto.name, granted, taken['days'], granted - taken['days'])
        self.assertEqual((granted, taken['days'], granted - taken['days']), (20, 11, 9))
