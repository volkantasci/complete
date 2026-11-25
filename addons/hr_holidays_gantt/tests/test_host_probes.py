# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""M86 and M87 of slice 002e2 on the host the package names: 002a's test host (the minimal view
of ``test_web_gantt``) on the phone with the search bar open (without touch emulation: with it the
panel is 4 px taller again, F3), and the popover sheet after a click on "Build". Skipped where
``test_web_gantt`` is not installed (it is in the demo run and in CI).

Run only these: ``--test-tags /hr_holidays_gantt:TestHostProbes`` on a database with
``test_web_gantt`` (and ``web_enterprise`` for the dark scheme).
"""
import unittest

from odoo.addons.test_web_gantt.tests.timeline_probe import TimelineProbeCase
from odoo.tests import tagged

from .action_probe_values import measured

HOST = 'test_web_gantt.host_action_h5'
PANEL = "document.querySelector('.o_control_panel')"
SHEET_FRAME = "document.querySelector('.o_popover > .o_tl_popover')"
SHEET_OUTER = "document.querySelector('.o_popover:has(> .o_tl_popover_sheet)')"


@tagged('post_install', '-at_install')
class TestHostProbes(TimelineProbeCase):

    @classmethod
    def setUpClass(cls):
        try:
            super().setUpClass()
        except KeyError as error:
            # the host's model exists only where test_web_gantt is installed
            raise unittest.SkipTest(f'test_web_gantt is not installed ({error})') from error

    def near(self, probe, element_js, scheme, delta, label):
        """The geometry of ``probe`` read on ``element_js``, within ``delta`` px."""
        expected = {prop: float(value) for prop, value in measured(probe, 'phone')[scheme].items()
                    if prop.startswith('geometry.')}
        got = self.read(element_js, list(expected))
        for prop, want in expected.items():
            with self.subTest(probe=probe, scheme=scheme, prop=prop):
                self.assertAlmostEqual(float(got[prop]), want, delta=delta,
                                       msg=f'{probe} {scheme} {prop}: {label}')

    def test_m86_m87_on_the_host(self):
        for scheme in ('light', 'dark'):
            if scheme == 'dark' and not self.has_theme:
                continue
            with self.subTest(scheme=scheme), self.page(HOST, scheme, 'phone', touch=False):
                if not self.js("!!document.querySelector('.o_searchview_input')"):
                    self.js("[...document.querySelectorAll('.o_control_panel button')]"
                            ".find((b) => b.querySelector(\"i[data-icon='search']\")).click()")
                    self.wait("!!document.querySelector('.o_searchview_input')")
                self.settle()
                # M86: the control panel with the search bar open, within 4 px (the shell's batch)
                self.near('M86', PANEL, scheme, 4, "002a's control panel")
                self.click_js(self.pill('Build'))
                self.wait("!!document.querySelector('.o_popover .o_tl_popover')")
                self.settle()
                # M87: the sheet's frame inside its 1 px border, and its outer box (the frame
                # grown by that border), within 2 px
                self.near('M87', SHEET_FRAME, scheme, 2, "002a's sheet frame")
                self.near('M87', SHEET_OUTER, scheme, 2, "002a's sheet outer box")
