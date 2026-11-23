# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of slice 002e, taken on demand (not part of the normal run).

One capture per screen S1 to S17 of the spec's ``screens/index.md``, with the index's file names
(light: no suffix, dark: ``-dark``, phone: ``.mobile``; the phone only where the index lists it).
The test is skipped unless the environment variable ``TIME_OFF_SCREENS`` is set, and carries the tag
``hr_holidays_gantt_screens`` (``-standard``: no other run picks it up). Run it on a database
that has ``web_enterprise`` (for the dark scheme) and ``hr_attendance_gantt`` (S11, S14, S16, S17),
with the git-ignored ``.cache/t002e_screens`` of the checkout mounted in the container and given as
``--screenshots``; the files land there::

    ... run --rm -e TIME_OFF_SCREENS=1 -v ./.cache/t002e_screens:/mnt/shots odoo odoo \\
        -d <db> -i hr_holidays_gantt,hr_attendance_gantt,web_enterprise \\
        --test-tags hr_holidays_gantt_screens --screenshots /mnt/shots --stop-after-init

The worlds are those of the probes (``test_probes``), the browser clock is Wednesday 11 November
2026, 11:00 in Brussels. S15 shows Complete's corrected display (decision D1: one-day pills read
"1d").
"""
import base64
import logging
import os
import pathlib
import unittest

import odoo
from odoo.tests import tagged

from . import test_probes as probes
from . import time_off_fixtures as fx
from .test_probes import (
    ANITA_COLOUR,
    ATTENDANCE,
    MANAGEMENT,
    MODAL,
    VIEWPORTS,
    TimeOffProbeCase,
    in_row,
    row_js,
)

_logger = logging.getLogger(__name__)

FLAG = 'TIME_OFF_SCREENS'
BOTH = VIEWPORTS
DESKTOP = ('desktop',)
PHONE = ('phone',)
TZ = fx.TZ
PROGRESS = "document.querySelectorAll('.o_tl_progress_label').length > 0"


class ScreenCase(TimeOffProbeCase):
    """The capture and the loop over the variants (scheme, viewport); it holds no test."""

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

    def away(self):
        """The pointer on an empty place of the control bar, so no tooltip stays open."""
        self.mouse('mouseMoved', 1000, 123, buttons=0)
        self.settle(1000)

    def calm(self):
        """As ``away``, and the search field loses the focus: the spec's images of the views that
        the user went on from the control bar show the field at rest."""
        self.js("document.activeElement?.blur()")
        self.away()

    def each(self, stem, prepare, viewports=BOTH, login='admin', action=probes.OVERVIEW,
             ready=PROGRESS, page_ready=None, schemes=None):
        """Open the page once per variant, run ``prepare(viewport)`` and store the capture as
        ``stem`` plus the variant's suffix. A variant that fails is logged and the next one still
        runs; the test fails at the end."""
        errors = []
        for scheme in schemes or self.schemes():
            for viewport in viewports:
                name = stem + ('-dark' if scheme == 'dark' else '') \
                    + ('.mobile' if viewport == 'phone' else '') + '.png'
                try:
                    with self.open(scheme, viewport, action=action, login=login,
                                   ready=page_ready):
                        self.loaded(ready) if ready else self.loaded()
                        prepare(viewport)
                        self.snap(name)
                except Exception as error:  # noqa: BLE001 - keep capturing the other variants
                    _logger.exception('screen %s failed', name)
                    errors.append(f'{name}: {error}')
        self.assertFalse(errors, '\n'.join(errors))


@tagged('-standard', 'hr_holidays_gantt_screens', 'post_install', '-at_install')
class TestScreensDemo(ScreenCase):
    """The leave view in the demo-like world: S1 to S3, S5, S7, S8, S13 (with the states world is
    elsewhere), S15."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.build_demo_world()

    def test_s01_month(self):
        self.each('01-month', lambda viewport: self.away())

    def test_s02_week(self):
        def prepare(viewport):
            self.to_week()
            self.calm()
        self.each('02-week', prepare)

    def test_s03_quarter(self):
        def prepare(viewport):
            self.choose_range('quarter')
            self.calm()
        self.each('03-quarter', prepare)

    def test_s05_card(self):
        def prepare(viewport):
            self.real_click(in_row('Anita Oliver', '.o_hrg_avatar'), settle=1.5)
            self.wait("!!document.querySelector('.o_popover .o_hhg_card_band')")
            self.settle(800)
        self.each('05-card', prepare, viewports=DESKTOP)

    def test_s07_cog(self):
        gear = "document.querySelectorAll('.o_cp_action_menus .dropdown-toggle')[0]"

        def prepare(viewport):
            if viewport == 'phone':
                # no gear beside the title: the view at rest
                self.calm()
                return
            self.real_click(gear, settle=1)
            self.wait("document.querySelectorAll('.o-dropdown--menu .dropdown-item').length > 0")
            self.settle(500)
        self.each('07-cog', prepare)

    def test_s08_empty(self):
        def prepare(viewport):
            self.search('zzz', phone=viewport == 'phone')
            self.settle(1500)
            if viewport == 'desktop':
                self.away()
        self.each('08-empty', prepare)

    def test_s15_filter_month(self):
        def prepare(viewport):
            self.pick_status('Approved')
            self.settle(1000)
            self.away()
        self.each('15-filter-month', prepare, viewports=DESKTOP)


@tagged('-standard', 'hr_holidays_gantt_screens', 'post_install', '-at_install')
class TestScreensRoles(ScreenCase):
    """The report view as a Time Off employee: S4, S6, S9."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.build_demo_world(anita_colour=ANITA_COLOUR)
        user = cls.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'Toff Role Emp', 'login': 'toff_emp', 'password': 'toff_emp', 'tz': TZ,
            'lang': 'en_US', 'email': 'toff_emp@example.com',
            'group_ids': [(6, 0, (cls.env.ref('base.group_user')
                                  | cls.env.ref('hr_holidays.group_hr_holidays_employee')).ids)],
        })
        fx._employee(cls.env, 'Toff Role Emp', cls.schedule, user=user)
        cls.env.flush_all()

    def test_s04_report(self):
        self.each('04-report', lambda viewport: self.away(), login='toff_emp', ready=None)

    def test_s06_card_emp(self):
        def prepare(viewport):
            self.real_click(in_row('Anita Oliver', '.o_hrg_avatar'), settle=1.5)
            self.wait("!!document.querySelector('.o_popover .o_hhg_card_band')")
            self.settle(800)
        self.each('06-card-emp', prepare, viewports=DESKTOP, login='toff_emp', ready=None)

    def test_s09_empty_report(self):
        def prepare(viewport):
            self.search('zzz', phone=viewport == 'phone')
            self.settle(1500)
            if viewport == 'desktop':
                self.away()
        self.each('09-empty-report', prepare, login='toff_emp', ready=None)





@tagged('-standard', 'hr_holidays_gantt_screens', 'post_install', '-at_install')
class TestScreensFlexible(ScreenCase):
    """S10 (leave view) and S11 (attendance view)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.made = fx.make_flexible(cls.env, cls.schedule)
        cls.isolate(keep={'Toff Flexible', 'Toff Fixed'})
        cls.has_attendance = bool(cls.env['ir.module.module'].sudo().search_count(
            [('name', '=', 'hr_attendance_gantt'), ('state', '=', 'installed')]))
        if cls.has_attendance:
            cls.admin.write({'group_ids': [
                (4, cls.env.ref('hr_attendance.group_hr_attendance_manager').id)]})
            cls.no_attendance([cls.made['Toff Flexible'], cls.made['Toff Fixed']])

    def test_s10_flex(self):
        def prepare(viewport):
            self.to_week()
            self.search('Toff', phone=viewport == 'phone')
            self.settle(1200)
            if viewport == 'desktop':
                self.away()
        self.each('10-flex', prepare)

    def test_s11_flex_att(self):
        if not self.has_attendance:
            self.skipTest('hr_attendance_gantt is not installed')

        def prepare(viewport):
            self.to_week()
            self.search('Toff', phone=viewport == 'phone')
            self.settle(1200)
            if viewport == 'desktop':
                self.away()
        self.each('11-flex-att', prepare, action=ATTENDANCE)


@tagged('-standard', 'hr_holidays_gantt_screens', 'post_install', '-at_install')
class TestScreensStates(ScreenCase):
    """S12 (Management > Time Off) and S13 (Overview)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.states = fx.make_states(cls.env, cls.schedule)
        cls.states.leave_manager_id = cls.admin
        cls.isolate(keep={'Toff States'})

    def test_s12_states(self):
        def prepare(viewport):
            self.js("document.querySelector('.o_cp_switch_buttons .o_switch_view.o_gantt')"
                    ".click()")
            self.wait("!!document.querySelector('.o_tl_renderer .o_tl_row_header')", timeout=30)
            self.loaded("!!document.querySelector('.o_tl_renderer .o_tl_row_header')")
            self.remove_facet('Waiting For Me')
            self.search('Toff States')
            self.to_week()
            self.settle(1500)
            self.calm()
        self.each('12-states', prepare, viewports=DESKTOP, action=MANAGEMENT,
                  page_ready='.o_list_view', ready="!!document.querySelector('.o_list_view')")

    def test_s13_states_overview(self):
        def prepare(viewport):
            self.to_week()
            self.search('Toff States', phone=viewport == 'phone')
            self.settle(1500)
            if viewport == 'desktop':
                self.away()
        self.each('13-states-overview', prepare)


@tagged('-standard', 'hr_holidays_gantt_screens', 'post_install', '-at_install')
class TestScreensAttendance(ScreenCase):
    """The attendance view in the demo-like world: S14, S16, S17."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        module = cls.env['ir.module.module'].sudo().search(
            [('name', '=', 'hr_attendance_gantt'), ('state', '=', 'installed')])
        if not module:
            raise unittest.SkipTest('hr_attendance_gantt is not installed')
        cls.admin.write({'group_ids': [
            (4, cls.env.ref('hr_attendance.group_hr_attendance_manager').id)]})
        cls.build_demo_world()
        cls.no_attendance(cls.world.values())

    def test_s14_att_week(self):
        def prepare(viewport):
            self.to_week()
            self.calm()
        self.each('14-att-week', prepare, action=ATTENDANCE)

    def test_s16_escape(self):
        break_input = f"document.querySelector('{MODAL} [name=\"break_duration\"] input')"

        def prepare(viewport):
            cell = (f"{row_js('Abigail Peterson')}"
                    ".querySelector('.o_tl_cell[data-column=\"15\"]')")
            self.js(f"{cell}.scrollIntoView({{block: 'nearest', inline: 'center'}})")
            self.settle(600)
            box = self.geometry(cell)
            header = self.geometry(in_row('Abigail Peterson', '.o_tl_row_header'))
            x = box['geometry.x'] + 20
            y = header['geometry.y'] + header['geometry.height'] / 2
            self.mouse('mouseMoved', x, y, buttons=0)
            self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
            self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
            self.wait(f"!!document.querySelector('{MODAL} .o_form_view .o_form_sheet')",
                      timeout=30)
            self.settle(1500)
            self.real_click(break_input)
            self.browser._websocket_request('Input.insertText', params={'text': '0:30'})
            self.settle(300)
            self.press_escape()
            self.settle(1500)
        self.each('16-escape', prepare, viewports=DESKTOP, action=ATTENDANCE,
                  ready="document.querySelectorAll('.o_tl_row_label').length > 0")

    def test_s17_helper(self):
        def prepare(viewport):
            self.search('zzzz', phone=True)
            self.wait("!!document.querySelector('.o_hag_helper')")
            self.settle(1500)
        self.each('17-helper', prepare, viewports=PHONE, action=ATTENDANCE,
                  ready="document.querySelectorAll('.o_tl_row_label').length > 0")
