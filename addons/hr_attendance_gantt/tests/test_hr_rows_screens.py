# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of slice 002d2, taken on demand (not part of the normal run).

One capture per screen S1 to S13 of the spec's ``screens/index.md`` (light: no suffix, dark:
``-dark``, phone: ``.mobile``; the phone only where the index lists it). The test is skipped unless
the environment variable ``HR_ROWS_SCREENS`` is set, and carries the tag
``hr_attendance_gantt_screens`` (``-standard``: no other run picks it up). Run it on a database that
has ``web_enterprise`` (for the dark scheme) with the git-ignored ``.cache/hr_rows_screens`` of the
checkout mounted in the container and given as ``--screenshots``; the files land there::

    ... run --rm -e HR_ROWS_SCREENS=1 \\
        -v <checkout>/.cache/hr_rows_screens:/mnt/shots odoo odoo \\
        -d <db> -i hr_attendance_gantt,test_web_gantt,web_enterprise \\
        --test-tags hr_attendance_gantt_screens --screenshots /mnt/shots --stop-after-init

The data are those of the probes (``test_hr_rows_probes``): the world of S1 to S5, S10 to S12 is the
22 employees that stand for the demo data (renamed here to the demo's names), the world of S6 to S9
the prepared employees "Gantt ...". The browser clock is Wednesday 11 November 2026, 11:00 in
Brussels.
"""
import base64
import logging
import os
import pathlib
import unittest

import odoo
from odoo.tests import tagged

from . import test_hr_rows_probes as probes
from .hr_rows_fixtures import PREFIX, make_prepared

_logger = logging.getLogger(__name__)

BOTH = ('desktop', 'phone')
DESKTOP = ('desktop',)
FLAG = 'HR_ROWS_SCREENS'
# the demo's names for the employees the probes call "HRA ..."
DEMO_NAMES = {
    'HRA Abigail': 'Abigail Peterson', 'HRA Anita': 'Anita Oliver',
    'HRA Audrey': 'Audrey Peterson', 'HRA Beth': 'Beth Evans', 'HRA Doris': 'Doris Cole',
    'HRA Eli': 'Eli Lambert', 'HRA Ernest': 'Ernest Reed', 'HRA Jennie': 'Jennie Fletcher',
    'HRA Keith': 'Keith Byrd', 'HRA Marc': 'Marc Demo', 'HRA Rachel': 'Rachel Perry',
    'HRA Tina': 'Tina Williamson', 'HRA Fay': 'Faith Moore', 'HRA Gus': 'Gus Hartley',
    'HRA Pat 01': 'Harper Quinn', 'HRA Pat 02': 'Ivy Stone', 'HRA Pat 03': 'Jules Marsh',
    'HRA Pat 04': 'Kim Doyle', 'HRA Pat 05': 'Lena Voss', 'HRA Pat 06': 'Noor Ali',
    'HRA Pat 07': 'Toni Jimenez', 'HRA Pat 08': 'Walter Horton',
}


@tagged('-standard', 'hr_attendance_gantt_screens', 'post_install', '-at_install')
class TestHrRowsScreens(probes.HrProbes):

    # the world of the probes, reused as it is
    employee = probes.TestHrRowsProbes.employee
    demo_world = probes.TestHrRowsProbes.demo_world

    @classmethod
    def setUpClass(cls):
        if not os.environ.get(FLAG):
            raise unittest.SkipTest(f'the screenshots are taken only with {FLAG} set')
        super().setUpClass()

    def snap(self, name):
        """Wait for animations to settle, then store the viewport as ``name``."""
        self.settle(900)
        res = self.browser._websocket_request('Page.captureScreenshot')
        folder = pathlib.Path(odoo.tools.config['screenshots'])
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(base64.b64decode(res['data']))

    def each(self, prepare, viewports=BOTH, login='admin'):
        """Run ``prepare(viewport, shot)`` once per variant; ``shot(stem)`` stores the viewport as
        the variant's file of ``stem``. A variant that fails is logged and the next one still runs;
        the test fails at the end."""
        errors = []
        for scheme in ('light', 'dark'):
            if scheme == 'dark' and not self.has_theme:
                continue
            for viewport in viewports:
                suffix = ('-dark' if scheme == 'dark' else '') \
                    + ('.mobile' if viewport == 'phone' else '') + '.png'
                taken = []

                def shot(stem, suffix=suffix, taken=taken):
                    taken.append(stem)
                    self.snap(stem + suffix)

                try:
                    with self.open(scheme, viewport, login=login):
                        self.loaded(viewport)
                        prepare(viewport, shot)
                except Exception as error:  # noqa: BLE001 - keep capturing the other variants
                    _logger.error('screens %s%s failed: %s', taken, suffix, error)
                    try:
                        self.snap('failed-' + suffix)
                    except Exception:  # noqa: BLE001
                        _logger.exception('no failure capture for %s', suffix)
                    errors.append(f'{taken}{suffix}: {error}')
        self.assertFalse(errors, '\n'.join(errors))

    def away(self):
        """The pointer on an empty place of the control bar, so no tooltip stays open."""
        self.mouse('mouseMoved', 1000, 123, buttons=0)
        self.settle(1200)

    def demo_screens(self):
        self.archive_others('HRA ')
        like = self.demo_world()
        like['HRA Anita'].write({
            'job_title': 'Head of Gantt', 'work_email': 'anita@example.com',
            'work_phone': '+32 2 123 45 67',
        })
        employees = self.env['hr.employee'].search([('name', 'like', 'HRA %')])
        for employee in employees:
            employee.name = DEMO_NAMES[employee.name]
        self.env.flush_all()

    def prepared_screens(self):
        # the prepared attendances are drawn as the spec's single pills of the default work entry
        # type: the Community's time rules would split their overtime into pills of another type
        make_prepared(
            self.env(context=dict(self.env.context, skip_time_rules=True)),
            demo_schedule=self.schedule)
        self.archive_others(PREFIX)
        self.env.flush_all()

    # -- S1 to S5, the demo data ----------------------------------------------------------------

    def test_s01_day(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.away()
            shot('01-day')
        self.each(prepare)

    def test_s02_card(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.real_click(probes.in_row('Anita Oliver', '.o_hrg_avatar'), settle=1.5)
            self.wait("!!document.querySelector('.o_popover')")
            shot('02-card')
        self.each(prepare, viewports=DESKTOP)

    def test_s03_week(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.choose_range('week')
            self.away()
            shot('03-week')
        self.each(prepare)

    def test_s04_unfolded(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.choose_range('week')
            self.real_click("document.querySelector('.o_tl_col.o_tl_folded')", settle=1.5)
            self.away()
            shot('04-unfolded')
        self.each(prepare, viewports=DESKTOP)

    def test_s05_tooltip(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.choose_range('week')
            self.rest_on(probes.in_row('Anita Oliver', '.o_tl_progress'), settle=1.5)
            self.wait("!!document.querySelector('.o-tooltip')", timeout=10)
            shot('05-tooltip')
        self.each(prepare, viewports=DESKTOP)

    # -- S6 to S9, the prepared employees -------------------------------------------------------

    def test_s06_labels(self):
        self.prepared_screens()

        def prepare(viewport, shot):
            self.search('Gantt', phone=viewport == 'phone')
            self.step(-1, 2)
            self.away()
            shot('06-labels')
        self.each(prepare)

    def test_s07_month(self):
        self.prepared_screens()

        def prepare(viewport, shot):
            self.search('Gantt')
            self.choose_range('month')
            self.away()
            shot('07-month')
        self.each(prepare, viewports=DESKTOP)

    def test_s08_quarters(self):
        self.prepared_screens()

        def prepare(viewport, shot):
            self.search('Gantt')
            self.choose_range('week')
            self.step(-1)
            self.away()
            shot('08-quarters')
        self.each(prepare, viewports=DESKTOP)

    def test_s09_open(self):
        self.prepared_screens()

        def prepare(viewport, shot):
            self.search('Gantt', phone=viewport == 'phone')
            self.away()
            shot('09-open')
        self.each(prepare)

    # -- S10 to S12, the demo data --------------------------------------------------------------

    def test_s10_helper(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.search('Beth Evans', phone=viewport == 'phone')
            self.wait("!!document.querySelector('.o_hag_helper')")
            self.settle(1200)
            shot('10-helper')
        self.each(prepare)

    def test_s13_helper_folded(self):
        """S13 (A69, A71, decision D4): the search on one employee without a contract, then Next
        and Previous; the folded page and the helper. Complete shows the same right after the
        search."""
        self.demo_screens()

        def prepare(viewport, shot):
            self.search('Beth Evans')
            self.wait("!!document.querySelector('.o_hag_helper')")
            self.step(1)
            self.step(-1)
            self.wait("!!document.querySelector('.o_hag_helper')")
            self.away()
            shot('13-helper-folded')
        self.each(prepare, viewports=DESKTOP)

    def test_s11_page2(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.act("document.querySelector('.o_pager_next').click()")
            self.away()
            shot('11-page2')
        self.each(prepare, viewports=DESKTOP)

    def test_s12_avatar_tooltip(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.rest_on(probes.in_row('Anita Oliver', '.o_hrg_avatar'), settle=1.5)
            self.wait("!!document.querySelector('.o-tooltip')", timeout=10)
            shot('12-avatar-tooltip')
        self.each(prepare, viewports=DESKTOP)

