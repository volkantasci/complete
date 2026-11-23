# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the prepared states (*flexible*, *states*) in the time-off leave view: A31, A37 and
A39. The harness is that of ``test_tours``; the tours are in
``static/tests/tours/time_off_prepared_tours.js``."""
from odoo.tests import tagged

from . import time_off_fixtures as fx
from .test_tours import MANAGEMENT, TimeOffToursBase


@tagged('post_install', '-at_install')
class TestPreparedStatesTours(TimeOffToursBase):

    def test_a31_flexible_leave_view(self):
        fx.make_flexible(self.env, self.schedule)
        self._isolate(keep={'Toff Flexible', 'Toff Fixed'})
        self._tour('hhg_a31_flexible_leave_view')

    def test_a37_states(self):
        states = fx.make_states(self.env, self.schedule)
        states.leave_manager_id = self.admin
        self._isolate(keep={'Toff States'})
        self._tour('hhg_a37_states', path=MANAGEMENT)

    def test_a39_overview_hides_refused(self):
        fx.make_states(self.env, self.schedule)
        self._isolate(keep={'Toff States'})
        self._tour('hhg_a39_overview_hides_refused')
