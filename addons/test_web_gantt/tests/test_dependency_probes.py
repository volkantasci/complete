# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of slice 002c (dependencies, rescheduling and buffers).

Run only these: ``--test-tags timeline_probes/test_web_gantt:TimelineDependencyProbes``. The dark
scheme needs ``web_enterprise``; without it the dark probes are skipped. The values are in
``timeline_dependency_probe_values``.

Elements read: M47 the name ``.o_tl_panel_name`` of "Unscheduled" in the side panel, M48 its line
``.o_tl_panel_line``.
"""
from odoo.tests import tagged

from .test_probes import SCHEMES, VIEWPORTS
from .timeline_dependency_probe_values import MEASURED
from .timeline_probe import TimelineProbeCase

HOST = 'test_web_gantt.host_action_{}'


@tagged('post_install', '-at_install', 'timeline_probes')
class TimelineDependencyProbes(TimelineProbeCase):

    # -- helpers --------------------------------------------------------------------

    def combos(self, probes, viewports=VIEWPORTS):
        found = []
        for scheme in SCHEMES:
            for viewport in viewports:
                if not any((scheme, viewport) in MEASURED[p] for p in probes):
                    continue
                if scheme == 'dark' and not self.has_theme:
                    continue
                found.append((scheme, viewport))
        if not found:
            self.skipTest('the dark scheme needs web_enterprise, which is not installed')
        return found

    def check(self, probe, element_js, scheme, viewport, label):
        expected = MEASURED[probe].get((scheme, viewport))
        if expected is not None:
            self.probe(probe, element_js, scheme, viewport, expected, label)

    @staticmethod
    def panel_line(name):
        return ("[...document.querySelectorAll('.o_tl_panel_line')].find("
                f"(l) => l.querySelector('.o_tl_panel_name').textContent === {name!r})")

    # -- M47, M48: the name and the line in the side panel, at rest (R1) ---------------

    def test_002c_m47_m48_panel_line(self):
        for scheme, viewport in self.combos(['M47', 'M48'], ('desktop',)):
            with self.page(HOST.format('h37'), scheme, viewport):
                self.wait("document.querySelectorAll('.o_tl_panel_line').length === 4")
                self.pointer_away()
                line = self.panel_line('Unscheduled')
                self.check('M47', f"{line}.querySelector('.o_tl_panel_name')", scheme, viewport,
                           'the name of Unscheduled in the side panel')
                self.check('M48', line, scheme, viewport, 'the line of Unscheduled')
