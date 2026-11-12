# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of the Gantt view, taken on demand (not part of the normal run).

One capture per screen of the spec's ``screens/index.md``, with the spec's file names (light: no
suffix, dark: ``-dark``, phone: ``.mobile``). Run with ``--test-tags gantt_view_screens`` and
``--screenshots <dir>`` on a database that has ``web_enterprise`` (for the dark scheme); the files
land in ``<dir>/gantt_view/``. The host records are built by the test (demo data is not needed).
"""
import base64
import json
import logging
import pathlib
import time
from datetime import datetime, timedelta
from datetime import time as dtime

import odoo
from odoo import fields
from odoo.tests import tagged

from .timeline_probe import TimelineProbeCase

_logger = logging.getLogger(__name__)

HOST = 'test_web_gantt.host_action_{}'
BOTH = ('desktop', 'phone')
DESKTOP = ('desktop',)
PHONE = ('phone',)


@tagged('-standard', 'gantt_view_screens', 'post_install', '-at_install')
class TimelineScreens(TimelineProbeCase):

    # -- plumbing -------------------------------------------------------------------

    def snap(self, name):
        """Wait for animations to settle, then store the viewport as ``name``."""
        self.settle(900)
        res = self.browser._websocket_request('Page.captureScreenshot')
        folder = pathlib.Path(odoo.tools.config['screenshots']) / 'gantt_view'
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(base64.b64decode(res['data']))

    def each(self, stem, host, prepare, viewports=BOTH, schemes=('light', 'dark')):
        """Capture ``stem`` for every variant; ``prepare(viewport)`` sets the state up.

        A variant that fails is logged and the next one still runs; the test fails at the end.
        """
        errors = []
        user = self.env.ref('base.user_admin')
        settings = self.env['res.users.settings']._find_or_create_for_user(user)
        for scheme in schemes:
            if scheme == 'dark' and not self.has_theme:
                continue
            for viewport in viewports:
                name = (stem + ('-dark' if scheme == 'dark' else '')
                        + ('.mobile' if viewport == 'phone' else '') + '.png')
                settings.color_scheme = scheme
                try:
                    with self.page(HOST.format(host), scheme, viewport):
                        prepare(viewport)
                        self.snap(name)
                except Exception as error:  # noqa: BLE001 - keep capturing the other variants
                    _logger.error('screen %s failed: %s', name, error)
                    try:
                        self.snap('failed-' + name)
                    except Exception:  # noqa: BLE001
                        _logger.exception('no failure capture for %s', name)
                    errors.append(f'{name}: {error}')
        self.assertFalse(errors, '\n'.join(errors))

    def mouse(self, kind, x, y, **extra):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': kind, 'x': x, 'y': y, **extra,
        })

    def tap(self, element_js):
        """A real click (move, press, release) in the middle of the element."""
        self.js(f"{element_js}.scrollIntoView({{block: 'nearest', inline: 'nearest'}})")
        box = self.geometry(element_js)
        x = box['geometry.x'] + box['geometry.width'] / 2
        y = box['geometry.y'] + box['geometry.height'] / 2
        self.mouse('mouseMoved', x, y)
        self.mouse('mousePressed', x, y, button='left', clickCount=1)
        self.mouse('mouseReleased', x, y, button='left', clickCount=1)
        self.settle()

    def open_range_menu(self):
        self.click_js("document.querySelector('.o_tl_range_button')")
        self.wait("!!document.querySelector('.o_tl_range_menu, .o_bottom_sheet .o_tl_range_item')")
        self.settle()

    def choose_range(self, kind, label):
        """Pick an entry of the range menu and wait until the button shows its label."""
        self.open_range_menu()
        self.click_js(f"document.querySelector('.o_tl_range_item.o_tl_range_{kind}')")
        self.wait("document.querySelector('.o_tl_range_button').textContent.trim() === "
                  f"{json.dumps(label)}")
        self.wait("!!document.querySelector('.o_tl_renderer .o_tl_row')")
        self.settle(700)

    def open_popover(self, name):
        self.click_js(self.pill(name))
        self.wait("!!document.querySelector('.o_popover .o_tl_popover, .o_tl_popover')")
        self.settle()

    # -- the attendance-like state of H12 (O-2 answers) -----------------------------

    def _local(self, days, clock='00:00'):
        hour, minute = (int(part) for part in clock.split(':'))
        day = fields.Date.to_date('2026-11-12') + timedelta(days=days)
        return fields.Datetime.to_string(datetime.combine(day, dtime(hour, minute))
                                         - timedelta(hours=3))

    def capacity_state(self):
        """Progress, unavailable days and folded weekends, as the attendance host shows them."""
        Pill = self.env['test.web.gantt.pill']
        c1, c2, c3 = (self.records[f'C{i}'] for i in (1, 2, 3))
        weekends = [(self._local(-5), self._local(-3)), (self._local(2), self._local(4))]
        for start, stop in weekends:
            Pill.search([('date_start', '<', stop), ('date_stop', '>', start)]).unlink()
        Pill.create({
            'name': 'Extra', 'x_contact': c1.id,
            'date_start': self._local(0, '10:00'), 'date_stop': self._local(1, '12:00'),
        })
        weekly = [{'start': start, 'stop': stop} for start, stop in weekends]
        unavailability = {
            str(c1.id): [{'start': self._local(1), 'stop': self._local(2)}, *weekly],
            str(c2.id): list(weekly),
            str(c3.id): [{'start': self._local(-11), 'stop': self._local(10)}],
        }
        self.env['ir.config_parameter'].set_str('test_web_gantt.hook_answers', json.dumps({
            'unavailability': {'x_contact': unavailability},
            'progress': {'x_contact': {
                str(c1.id): {'value': 29, 'max_value': 120},
                str(c2.id): {'value': 96, 'max_value': 120},
                str(c3.id): {'value': 8, 'max_value': 40},
            }},
        }))

    # -- S1 to S9 -------------------------------------------------------------------

    def test_s01_week_ungrouped(self):
        self.each('01-week-ungrouped', 'h1', lambda v: None)

    def test_s02_grouped_two_levels(self):
        self.each('02-grouped-two-levels', 'h3', lambda v: None)

    def test_s03_group_collapsed(self):
        def prepare(viewport):
            self.click_js(f"{self.row('Alpha')}.querySelector('.o_tl_row_header')")
        self.each('03-group-collapsed', 'h3', prepare)

    def test_s04_sparse_pager(self):
        self.each('04-sparse-pager', 'h6', lambda v: None)

    def test_s05_many2many_rows(self):
        self.each('05-many2many-rows', 'h4', lambda v: None)

    def test_s06_default_range(self):
        self.each('06-default-range', 'h5', lambda v: None)

    def test_s07_popover_default(self):
        self.each('07-popover-default', 'h5', lambda v: self.open_popover('Build'))

    def test_s08_popover_custom(self):
        self.each('08-popover-custom', 'h7', lambda v: self.open_popover('Build'))

    def test_s09_range_menu(self):
        self.each('09-range-menu', 'h2', lambda v: self.open_range_menu())

    # -- S10 to S14 -----------------------------------------------------------------

    def test_s10_day(self):
        self.each('10-day', 'h2', lambda v: self.choose_range('day', 'Day'))

    def test_s11_month(self):
        self.each('11-month', 'h2', lambda v: self.choose_range('month', 'Month'),
                  viewports=DESKTOP)

    def test_s12_quarter(self):
        self.each('12-quarter', 'h2', lambda v: self.choose_range('quarter', 'Quarter'),
                  viewports=DESKTOP)

    def test_s13_year_after_quarter(self):
        def prepare(viewport):
            self.choose_range('quarter', 'Quarter')
            self.choose_range('year', 'Year')
        self.each('13-year', 'h2', prepare, viewports=DESKTOP)

    def test_s14_custom_picker(self):
        def prepare(viewport):
            self.choose_range('year', 'Year')
            self.open_range_menu()
            self.tap("document.querySelector('.o_tl_custom_start input')")
            self.wait("!!document.querySelector('.o_datetime_picker')")
        self.each('14-custom-picker', 'h2', prepare, viewports=DESKTOP)

    # -- S15 to S18 -----------------------------------------------------------------

    def test_s15_sample_data(self):
        self.each('15-sample-data', 'h8', lambda v: None)

    def test_s16_empty(self):
        self.each('16-empty', 'h9', lambda v: None)

    def test_s17_date_fields_month(self):
        self.each('17-date-fields-month', 'h10', lambda v: None)

    def test_s18_progress_unavailability(self):
        self.capacity_state()
        self.each('18-progress-unavailability', 'h12', lambda v: None)

    # -- S19 to S24 -----------------------------------------------------------------

    def test_s19_phone_toolbar_menu(self):
        def prepare(viewport):
            self.choose_range('day', 'Day')
            self.click_js("document.querySelector('.o_tl_gear')")
            self.wait("!!document.querySelector('.o_tl_gear_menu, .o_bottom_sheet')")
            self.settle()
        self.each('19-phone-toolbar-menu', 'h2', prepare, viewports=PHONE)

    def test_s20_pill_hover(self):
        def prepare(viewport):
            self.pointer_to(self.pill('Build'))
        self.each('20-pill-hover', 'h3', prepare, viewports=DESKTOP)

    def test_s21_folded_column_opened(self):
        self.capacity_state()

        def prepare(viewport):
            self.click_js("document.querySelector('.o_tl_col.o_tl_folded')")
            self.settle(700)
        self.each('21-folded-column-opened', 'h12', prepare, viewports=DESKTOP)

    def test_s22_progress_tooltip(self):
        self.capacity_state()

        def prepare(viewport):
            track = f"{self.row('Host Contact 1')}.querySelector('.o_tl_progress')"
            self.pointer_to(track)
            self.wait("!!document.querySelector('.o-tooltip')", timeout=10)
            time.sleep(.3)
        self.each('22-progress-tooltip', 'h12', prepare, viewports=DESKTOP)

    def test_s23_group_row_hover(self):
        def prepare(viewport):
            self.pointer_to(f"{self.row('Beta')}.querySelector('.o_tl_row_header')")
        self.each('23-group-row-hover', 'h3', prepare, viewports=DESKTOP)

    def test_s24_year_from_week(self):
        self.each('24-year-from-week', 'h2', lambda v: self.choose_range('year', 'Year'))
