# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of the measured values of slice 002d2 (spec.md, "Measured values"): the attendance Gantt
view of Attendances > Management > Dashboard in a real headless Chrome, compared with the table of
the original by machine (``hr_rows_probe_values``).

Run only these: ``--test-tags /hr_attendance_gantt:TestHrRowsProbes,/hr_attendance_gantt:
TestHrRowsPreparedProbes``. The dark scheme needs ``web_enterprise``; without it the dark probes
are skipped. The browser clock is Wednesday 11 November 2026, 10:00:05 UTC (11:00 in Brussels, the
browser's zone), and runs on; the window is 1600 x 900 (phone 390 x 844, touch).

Two worlds, because the rows of the demo data and the prepared records cannot share one page:

* ``TestHrRowsProbes`` builds 22 employees "HRA ..." that stand for the demo data. The probes that
  read a position that depends on the rows above (M1's y 253, M8, M16, M19) need the same rows,
  in the same order, as the demo page: Anita Oliver is the second row (one row above her); Keith
  Byrd the eleventh, with eight single rows between Anita Oliver and him (ruling T11-1). The other
  demo employees are archived so that no stray row shows.
* ``TestHrRowsPreparedProbes`` builds the prepared employees "Gantt ..." of acceptance.md, found
  with the search "Gantt" (ruling T11-2).

Elements read: M1 the avatar ``.o_hrg_avatar``; M2 the name box ``.o_tl_row_name``, M3 the name
``.o_tl_row_label``; M4, M17, M24, M26, M28, M30, M31, M35, M36, M62 the label
``.o_tl_progress_label``; M5 the track ``.o_tl_progress``, M6, M18, M25, M27, M29, M64 its fill
``.o_tl_progress_fill``; M7, M16, M34, M63 the row header ``.o_tl_row_header``; M8, M19, M38, M48,
M52, M53 a cell ``.o_tl_cell``; M9, M39 to M47, M50, M51 a pill ``.o_tl_pill``; M10 the popover
``.o_popover`` of the card; M13, M14, M21 a folded or open column header ``.o_tl_col``; M23 the
tooltip ``.o-tooltip``; M54, M55 the helper ``.o_hag_helper``; M59, M65, M66 the scroll position of
``.o_tl_renderer``. Counts (M11, M12, M20, M22, M32, M33, M37, M49, M56 to M58, M60, M61, M67 to
M71) are of the elements the place describes.

Where the original's value is the defect of a decision (M4, M6, M44 to M46, M62, M64, M72 to M75),
the probe compares Complete's value, which the spec states with the decision (see
``hr_rows_probe_values``).

The package's scrollbars: none of its values assumes classic scrollbars (the capture harness hides
them, as the default of this probe case does), so no probe draws them (ruling T11-3).
"""
import json
import logging
import re

from odoo.addons.test_web_gantt.tests.timeline_probe import (
    CLOCK_TEMPLATE,
    TimelineProbeCase,
    compare_value,
)
from odoo.tests import HttpCase, tagged

from .hr_rows_fixtures import (
    PREFIX,
    TZ,
    _datetime,
    make_demo_like,
    make_prepared,
    make_whole_day_schedule,
)
from .hr_rows_probe_values import WORKED, measured

_logger = logging.getLogger(__name__)

ACTION = 'hr_attendance.hr_attendance_action'
# five seconds after the hour: the page loads within the first second or two, and a load at exactly
# 11:00:00 would end an open pill at 11:00 (A31's own note)
CLOCK = CLOCK_TEMPLATE % '2026, 10, 11, 10, 0, 5'
SCHEMES = ('light', 'dark')
SCHEDULE = 'HRA 40 hours/week'
LABEL = '.o_tl_progress_label'

# in the page: the view's data calls, counted when they leave and when their answer comes
INSTALL_COUNTER = """(() => {
    window.__hp = { requests: 0, responses: 0 };
    const { rpcBus } = odoo.loader.modules.get('@web/core/network/rpc');
    const isData = (ev) => ev.detail?.data?.params?.method === 'get_gantt_data';
    rpcBus.addEventListener('RPC:REQUEST', (ev) => { if (isData(ev)) { window.__hp.requests++; } });
    rpcBus.addEventListener('RPC:RESPONSE', (ev) => {
        if (isData(ev)) { window.__hp.responses++; }
    });
})()"""

# a signature of the period and rows that are drawn, to see that a step has taken effect
SIGNATURE = """JSON.stringify([
    [...document.querySelectorAll('.o_tl_col')].map((e) => e.dataset.date || ''),
    [...document.querySelectorAll('.o_tl_col_group_label')].map((e) => e.textContent.trim()),
    [...document.querySelectorAll('.o_tl_row_label')].map((e) => e.textContent.trim()),
])"""

ROW_EL = "[...document.querySelectorAll('.o_tl_row:not(.o_tl_total_row)')]"


def row_js(name):
    return (f"{ROW_EL}.find((r) => r.querySelector('.o_tl_row_label')?.textContent.trim() === "
            f"{json.dumps(name)})")


def in_row(name, selector):
    return f"{row_js(name)}.querySelector({json.dumps(selector)})"


def pills_of(name):
    """The pills of a row from the left to the right."""
    return (f"[...{row_js(name)}.querySelectorAll('.o_tl_pill')]"
            ".sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)")


def cells_of(name):
    """The cells of a row from the left to the right."""
    return (f"[...{row_js(name)}.querySelectorAll('.o_tl_cell')]"
            ".sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)")


def cell_of_day(name, date):
    """The first cell of the row that starts at the column of ``date`` (a day column)."""
    column = f"document.querySelector('.o_tl_col[data-date=\"{date}\"]')"
    return (f"{cells_of(name)}.find((c) => c.getBoundingClientRect().x >= "
            f"{column}.getBoundingClientRect().x - 1)")


class HrProbes(TimelineProbeCase):
    """The helpers of both worlds: a page, the steps, the real input, the readings."""

    @classmethod
    def setUpClass(cls):
        # the host records of the timeline probes are not wanted here
        HttpCase.setUpClass.__func__(cls)
        cls.has_theme = bool(cls.env['ir.module.module'].search_count(
            [('name', '=', 'web_enterprise'), ('state', '=', 'installed')]))
        admin = cls.env.ref('base.user_admin')
        admin.write({
            'lang': 'en_US', 'tz': TZ,
            'group_ids': [(4, cls.env.ref('hr_attendance.group_hr_attendance_manager').id)],
        })
        # one active language: a second one changes no element of the views
        others = cls.env['res.lang'].search([('active', '=', True), ('code', '!=', 'en_US')])
        if others:
            cls.env['res.users'].with_context(active_test=False).search(
                [('lang', 'in', others.mapped('code'))]).write({'lang': 'en_US'})
            cls.env['res.partner'].with_context(active_test=False).search(
                [('lang', 'in', others.mapped('code'))]).write({'lang': 'en_US'})
            others.write({'active': False})
        cls.schedule = make_whole_day_schedule(cls.env, SCHEDULE)

    @classmethod
    def archive_others(cls, prefix):
        """The demo data's employees (when loaded) leave the page: only ``prefix`` ones show."""
        cls.env['hr.employee'].search([('name', 'not like', prefix + '%')]).write({'active': False})

    # -- the page -------------------------------------------------------------------------------

    def schemes(self, probes, viewport='desktop'):
        found = [scheme for scheme in SCHEMES
                 if any(scheme in measured(probe, viewport) for probe in probes)
                 and (scheme == 'light' or self.has_theme)]
        if not found:
            self.skipTest('the dark scheme needs web_enterprise, which is not installed')
        return found

    def open(self, scheme, viewport='desktop', login='admin', timezone=TZ, clock=CLOCK,
             touch=False):
        """The attendance Gantt view from the Management > Dashboard action. The phone images and
        values were taken without touch emulation (screens/index.md); only the tap of M11 asks
        for it."""
        return self.page(ACTION, scheme, viewport, login=login, clock=clock, timezone=timezone,
                         touch=touch, ready='.o_tl_renderer .o_tl_row')

    def loaded(self, viewport='desktop'):
        """The page is drawn with its data (the labels and pills are in)."""
        self.wait("document.querySelectorAll('.o_tl_progress_label').length > 0 || "
                  "document.querySelectorAll('.o_hag_helper').length > 0", timeout=60)
        self.js(INSTALL_COUNTER)
        # the capture harness draws no scrollbar: the grid is 1333 px wide in the Day range
        self.browser._websocket_request('Emulation.setScrollbarsHidden', params={'hidden': True})
        self.js("document.head.appendChild(Object.assign(document.createElement('style'), "
                "{textContent: '* { scrollbar-width: none !important; }'}))")
        self.settle(900)

    def idle(self, extra=0.9):
        """No data call is on its way and the answers are drawn."""
        self.wait("window.__hp.responses >= window.__hp.requests", timeout=60)
        self.settle(int(extra * 1000))

    def act(self, expression, data=True, extra=0.9):
        """Run a step in the page; with ``data`` wait for the data call it causes."""
        before = self.js("window.__hp.requests")
        self.js(expression)
        if data:
            self.wait(f"window.__hp.requests > {before}", timeout=30)
        self.idle(extra)

    def signature(self):
        return self.js(SIGNATURE)

    # -- steps ----------------------------------------------------------------------------------

    def choose_range(self, kind):
        label = kind.capitalize()
        before = self.signature()
        self.js("document.querySelector('.o_tl_range_button').click()")
        self.wait(f"!!document.querySelector('.o_tl_range_menu .o_tl_range_{kind}')")
        self.js(f"document.querySelector('.o_tl_range_menu .o_tl_range_{kind}').click()")
        self.wait("document.querySelector('.o_tl_range_button').textContent.trim() === "
                  f"{json.dumps(label)}")
        self.wait(f"{SIGNATURE} !== {json.dumps(before)}", timeout=30)
        self.idle()

    def step(self, direction, times=1):
        for _ in range(times):
            before = self.signature()
            button = '.o_tl_next' if direction > 0 else '.o_tl_previous'
            self.js(f"document.querySelector('{button}').click()")
            self.wait(f"{SIGNATURE} !== {json.dumps(before)}", timeout=30)
            self.idle(0.6)
        self.idle()

    def open_phone_search(self):
        if not self.js("!!document.querySelector('.o_searchview_input')"):
            self.js("[...document.querySelectorAll('.o_control_panel button')]"
                    ".find((b) => b.querySelector(\"i[data-icon='search']\")).click()")
            self.wait("!!document.querySelector('.o_searchview_input')")

    def search(self, text, field='Employee', phone=False):
        if phone:
            self.open_phone_search()
        wanted = f'Search {field} for: {text}'
        self.js(f"""(() => {{
            const input = document.querySelector('.o_searchview_input');
            input.focus();
            input.value = {json.dumps(text)};
            input.dispatchEvent(new Event('input', {{ bubbles: true }}));
        }})()""")
        item = ("[...document.querySelectorAll('.o_searchview_autocomplete .o-dropdown-item')]"
                f".find((e) => e.textContent.replace(/\\s+/g, ' ').includes({json.dumps(wanted)}))")
        self.wait(f"!!({item})")
        before = self.js("window.__hp.requests")
        self.js(f"{item}.click()")
        self.wait("[...document.querySelectorAll('.o_searchview_facet')]"
                  f".some((e) => e.textContent.includes({json.dumps(text)}))")
        self.wait(f"window.__hp.requests > {before}", timeout=30)
        self.idle()

    def pick_filter(self, text):
        self.js("document.querySelector('.o_searchview_dropdown_toggler').click()")
        item = ("[...document.querySelectorAll('.o_filter_menu .o_menu_item')]"
                f".find((e) => e.textContent.trim() === {json.dumps(text)})")
        self.wait(f"!!({item})")
        before = self.js("window.__hp.requests")
        self.js(f"{item}.click()")
        self.wait(f"window.__hp.requests > {before}", timeout=30)
        self.js("document.querySelector('.o_search_bar_menu') && "
                "document.querySelector('.o_searchview_dropdown_toggler').click()")
        self.idle()

    # -- real input -----------------------------------------------------------------------------

    def centre(self, element_js):
        box = self.geometry(element_js)
        return (box['geometry.x'] + box['geometry.width'] / 2,
                box['geometry.y'] + box['geometry.height'] / 2)

    def mouse(self, kind, x, y, **extra):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': kind, 'x': x, 'y': y, 'button': extra.pop('button', 'none'), **extra})

    def real_click(self, element_js, modifiers=0, settle=0.9):
        """A press and a release of the real mouse at the middle of the element."""
        x, y = self.centre(element_js)
        self.mouse('mouseMoved', x, y, buttons=0, modifiers=modifiers)
        self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1,
                   modifiers=modifiers)
        self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1,
                   modifiers=modifiers)
        self.settle(int(settle * 1000))

    def rest_on(self, element_js, settle=0.9):
        """The real pointer rests at the middle of the element, then away from nothing else."""
        x, y = self.centre(element_js)
        self.mouse('mouseMoved', x, y, buttons=0)
        self.settle(int(settle * 1000))

    def finger_tap(self, element_js):
        x, y = self.centre(element_js)
        request = self.browser._websocket_request
        request('Input.dispatchTouchEvent', params={
            'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        request('Input.dispatchTouchEvent', params={'type': 'touchEnd', 'touchPoints': []})
        self.settle(900)

    def press_escape(self):
        request = self.browser._websocket_request
        for kind in ('keyDown', 'keyUp'):
            request('Input.dispatchKeyEvent', params={
                'type': kind, 'key': 'Escape', 'code': 'Escape', 'windowsVirtualKeyCode': 27})
        self.settle(500)

    # -- checks ---------------------------------------------------------------------------------

    def check(self, probe, element_js, scheme, viewport, label, skip=()):
        expected = {prop: value for prop, value in measured(probe, viewport).get(scheme, {}).items()
                    if prop not in skip}
        self.assertTrue(expected, f'no value of {probe} in {scheme}/{viewport}')
        self.probe(probe, element_js, scheme, viewport, expected, label)

    def check_outer(self, probe, element_js, scheme, viewport, label):
        """The outer box of a pill (the boxes of M39 to M47, M50 and M51 read the original's
        pill slot): the pill's box and the 1 px gap around it that 002a leaves in its cell, so the
        pill grown by 1 px on each side (ruling T11-4)."""
        box = self.geometry(element_js)
        grown = {
            'geometry.x': box['geometry.x'] - 1, 'geometry.y': box['geometry.y'] - 1,
            'geometry.width': box['geometry.width'] + 2,
            'geometry.height': box['geometry.height'] + 2,
        }
        for prop, want in measured(probe, viewport)[scheme].items():
            with self.subTest(probe=probe, scheme=scheme, viewport=viewport, prop=prop,
                              element=label):
                why = compare_value(prop, want, grown[prop])
                if why:
                    _logger.warning('PROBE-MISMATCH|%s|%s|%s|%s|%s|%s|%s', probe, scheme, viewport,
                                    prop, want, grown[prop], label)
                self.assertIsNone(why, f'{probe} {scheme}/{viewport} {prop}: {why}')

    @staticmethod
    def stops_of(gradient):
        """``[(position, colour text)]`` of a hard-edged gradient (``to right`` or ``90deg``),
        a stop with one position or with two (``colour 0% 25%``)."""
        stops = []
        for colour_text, first, second in re.findall(
                r'(rgba?\([^)]*\)|transparent)(?:\s+([\d.]+)%)?(?:\s+([\d.]+)%)?', gradient):
            for position in (first, second):
                if position != '':
                    stops.append((float(position), colour_text))
        return stops

    def check_quarters(self, probe, element_js, scheme, label):
        """The four quarters of 002a's shading: the first and last grey, the middle two not. The
        table's text (stops at 24 % and 25 %) and the framework's (0 % to 25 %) draw the same
        hard edges, so the colour of each quarter is compared, not the text of the gradient."""
        want = measured(probe)[scheme]['background-image']
        got = self.js(f"getComputedStyle({element_js}).backgroundImage")

        def quarters(text):
            stops = self.stops_of(text)
            found = []
            for middle in (12.5, 37.5, 62.5, 87.5):
                colour = ([c for p, c in stops if p <= middle] or [stops[0][1]])[-1]
                found.append(colour)
            return found

        expected_quarters, got_quarters = quarters(want), quarters(got)
        grey = expected_quarters[0]
        with self.subTest(probe=probe, scheme=scheme, element=label):
            self.assertEqual(
                [c == grey for c in got_quarters], [c == grey for c in expected_quarters],
                f'{probe} {scheme}: {got} instead of {want}')

    def check_bottom(self, element_js, bottom, probe):
        box = self.geometry(element_js)
        with self.subTest(probe=probe, prop='bottom edge'):
            self.assertAlmostEqual(box['geometry.y'] + box['geometry.height'], bottom, delta=1)

    def dump(self, label, *selectors):
        """A diagnostic line: the boxes of some containers (a probe that fails reads them)."""
        boxes = {sel: self.js(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); "
                              "if (!e) { return null; } const r = e.getBoundingClientRect(); "
                              "return [r.x, r.y, r.width, r.height]; })()") for sel in selectors}
        _logger.warning('BOXES|%s|%s', label, json.dumps(boxes))

    def check_count(self, probe, count_js, scheme, viewport, label):
        """A ``count`` probe: how many elements the place describes."""
        want = int(measured(probe, viewport)[scheme]['count'])
        got = self.js(count_js)
        with self.subTest(probe=probe, scheme=scheme, viewport=viewport, element=label):
            if got != want:
                _logger.warning('PROBE-MISMATCH|%s|%s|%s|count|%s|%s|%s', probe, scheme, viewport,
                                want, got, label)
            self.assertEqual(got, want, f'{probe} {scheme}/{viewport} {label}')

    def check_scroll(self, probe, scheme, viewport, label):
        """A ``scroll-left`` probe: the position of the grid's scrolling area."""
        want = float(measured(probe, viewport)[scheme]['scroll-left'])
        got = self.js("document.querySelector('.o_tl_renderer').scrollLeft")
        with self.subTest(probe=probe, scheme=scheme, viewport=viewport, element=label):
            if abs(got - want) > 1:
                _logger.warning('PROBE-MISMATCH|%s|%s|%s|scroll-left|%s|%s|%s', probe, scheme,
                                viewport, want, got, label)
            self.assertAlmostEqual(got, want, delta=1, msg=f'{probe} {scheme}/{viewport} {label}')

    def text_of(self, element_js):
        return self.js(f"({element_js}).textContent.replace(/\\s+/g, ' ').trim()")

    def check_text(self, element_js, wanted, label):
        got = self.text_of(element_js)
        with self.subTest(text=label):
            self.assertEqual(got, wanted, label)

    def check_label_right(self, name, scheme, viewport='desktop'):
        """M4: the label is anchored to the right end of the title line, its right edge at x 258
        (8 px inside the 267 px column's right border)."""
        box = self.geometry(in_row(name, LABEL))
        with self.subTest(probe='M4', scheme=scheme, prop='right edge'):
            self.assertAlmostEqual(box['geometry.x'] + box['geometry.width'], 258, delta=0.5)

    def check_worked(self, key, name, scheme):
        """A worked value of R16 (Complete's column): the label's text, the colour of its state
        and the width of the fill."""
        text, status, fill = WORKED[key]
        self.check_text(in_row(name, LABEL), text, f'{key}: the label of {name}')
        colour_of = {'danger': 'M26', 'warning': 'M24', 'success': 'M28'}[status]
        want = measured(colour_of)[scheme]['color']
        got = self.js(f"getComputedStyle({in_row(name, LABEL)}).color")
        with self.subTest(worked=key, scheme=scheme, prop='label colour'):
            self.assertIsNone(compare_value('color', want, got),
                              f'{key} label colour {got} vs {want}')
        bar = {'danger': 'M27', 'warning': 'M25', 'success': 'M29'}[status]
        want = measured(bar)[scheme]['background-color']
        fill_js = in_row(name, '.o_tl_progress_fill')
        got = self.js(f"getComputedStyle({fill_js}).backgroundColor")
        with self.subTest(worked=key, scheme=scheme, prop='fill colour'):
            self.assertIsNone(compare_value('background-color', want, got),
                              f'{key} fill colour {got} vs {want}')
        width = self.geometry(fill_js)['geometry.width']
        with self.subTest(worked=key, scheme=scheme, prop='fill width'):
            self.assertAlmostEqual(width, fill, delta=0.6, msg=f'{key} fill width')


@tagged('post_install', '-at_install')
class TestHrRowsProbes(HrProbes):
    """The demo-like world: 22 employees named "HRA ..." (ruling T11-1)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.archive_others('HRA ')

    def employee(self, name, contract=('2026-01-01', None), attendances=(), **values):
        vals = {
            'name': name, 'tz': TZ, 'resource_calendar_id': self.schedule.id,
            'contract_date_start': contract[0] if contract else False,
            'contract_date_end': contract[1] if contract else False,
        }
        vals.update(values)
        employee = self.env['hr.employee'].create(vals)
        for check_in, check_out in attendances:
            self.env['hr.attendance'].with_context(skip_time_rules=True).create({
                'employee_id': employee.id, 'check_in': _datetime(check_in),
                'check_out': _datetime(check_out),
            })
        return employee

    def demo_world(self):
        """22 employees in the demo's order of names: Abigail, Anita (the second row), Audrey,
        Beth, Doris, Eli, Ernest, two more, Jennie, Keith (the eleventh), Marc, and the rest. The
        demo data's own: the table of acceptance.md; the others are fillers that work through
        November (the demo's "other demo employees")."""
        like = make_demo_like(self.env, self.schedule)
        like['HRA Marc'] = self.employee(
            'HRA Marc', contract=('2025-01-01', None),
            attendances=[(f'2026-10-{day:02d} 07:00:00', f'2026-10-{day:02d} 15:00:00')
                         for day in range(1, 11)])
        for name in ('Doris', 'Eli', 'Ernest', 'Rachel'):
            like[f'HRA {name}'] = self.employee(f'HRA {name}', contract=None)
        like['HRA Tina'] = self.employee('HRA Tina', contract=('2018-01-01', '2025-06-30'))
        for name in ('Fay', 'Gus'):
            like[f'HRA {name}'] = self.employee(f'HRA {name}')
        for index in range(1, 9):
            self.employee(f'HRA Pat {index:02d}')
        self.assertEqual(self.env['hr.employee'].search_count([('active', '=', True)]), 22)
        self.env.flush_all()
        return like

    # -- M1 to M9: the Day range at rest (S1) ---------------------------------------------------

    def day_probes(self, scheme, viewport):
        """M1 to M9 of the Day range of 11 November, light or dark, desktop or phone."""
        anita, audrey = 'HRA Anita', 'HRA Audrey'
        if True:
            for selector in ('.o_tl_row_header', '.o_tl_row_body', '.o_tl_row_line',
                             '.o_tl_row_name', '.o_tl_row_label', '.o_tl_progress_label',
                             '.o_tl_progress', '.o_hrg_avatar'):
                _logger.warning('ROWBOX|%s|%s', selector, self.js(
                    f"JSON.stringify((() => {{ const r = {in_row(anita, selector)}"
                    ".getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })())"))
        self.check('M1', in_row(anita, '.o_hrg_avatar'), scheme, viewport, 'the avatar')
        self.check('M2', in_row(anita, '.o_tl_row_label'), scheme, viewport, 'the name box')
        self.check('M3', in_row(audrey, '.o_tl_row_label'), scheme, viewport,
                   'the name without a contract')
        self.check('M8', f"{cells_of(audrey)}[0]", scheme, viewport,
                   'the 12 am cell of the row without a contract')
        self.check('M9', in_row('HRA Abigail', '.o_tl_pill'), scheme, viewport,
                   'the pill of Abigail')
        if viewport == 'desktop':
            self.check('M4', in_row(anita, LABEL), scheme, viewport, 'the label of Anita')
            self.check_label_right(anita, scheme)
            self.check_text(in_row(anita, LABEL), WORKED['ANITA_DAY_11'][0], 'the label text')
            self.check('M5', in_row(anita, '.o_tl_progress'), scheme, viewport, 'the track')
            self.check('M6', in_row(anita, '.o_tl_progress_fill'), scheme, viewport,
                       'the fill of Anita (full, warning)')
            self.check('M7', in_row(anita, '.o_tl_row_header'), scheme, viewport, 'the row header')
        else:
            self.check('M62', in_row(anita, LABEL), scheme, viewport, 'the short label of Anita')
            self.check_text(in_row(anita, LABEL), '+1h', 'the short label text')
            self.check('M63', in_row(anita, '.o_tl_row_header'), scheme, viewport, 'the header')
            self.check('M64', in_row(anita, '.o_tl_progress_fill'), scheme, viewport,
                       'the fill of Anita on the phone')

    def test_m01_m09_day_range(self):
        self.demo_world()
        for scheme in self.schemes(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9']):
            with self.open(scheme):
                self.loaded()
                self.day_probes(scheme, 'desktop')

    def test_m01_m09_day_range_phone(self):
        self.demo_world()
        for scheme in self.schemes(['M1', 'M2', 'M3', 'M8', 'M9', 'M62', 'M63', 'M64'], 'phone'):
            with self.open(scheme, 'phone'):
                self.loaded('phone')
                self.day_probes(scheme, 'phone')

    # -- M10 to M12: the card, the tap and the tooltip of an avatar -----------------------------

    def test_m10_m12_card_and_tooltip(self):
        like = self.demo_world()
        like['HRA Anita'].write({
            'job_title': 'Head of Gantt', 'work_email': 'hra.anita@example.com',
            'work_phone': '+32 2 123 45 67',
        })
        for scheme in self.schemes(['M10', 'M12']):
            with self.open(scheme):
                self.loaded()
                avatar = in_row('HRA Anita', '.o_hrg_avatar')
                self.real_click(avatar, settle=1.5)
                self.wait("!!document.querySelector('.o_popover')")
                # the card's width is that of its content: 382 px with the skills section of the
                # Community's skills application, which Complete's database does not have
                # (ruling T11-5); its place and look are compared
                self.check('M10', "document.querySelector('.o_popover')", scheme, 'desktop',
                           'the employee card', skip=('geometry.width',))
                self.press_escape()
                self.wait("!document.querySelector('.o_popover')")
                self.mouse('mouseMoved', 2, 2, buttons=0)
                self.settle(500)
                self.rest_on(avatar, settle=1.5)
                self.wait("!!document.querySelector('.o-tooltip')", timeout=10)
                self.check_count('M12', "document.querySelectorAll('.o-tooltip').length", scheme,
                                 'desktop', 'tooltips on the avatar')
                self.check_text("document.querySelector('.o-tooltip')", 'HRA Anita', 'the name')

    def test_m11_tap_on_the_phone(self):
        self.demo_world()
        for scheme in self.schemes(['M11'], 'phone'):
            with self.open(scheme, 'phone', touch=True):
                self.loaded('phone')
                self.finger_tap(in_row('HRA Anita', '.o_hrg_avatar'))
                self.settle(1500)
                self.check_count('M11', "document.querySelectorAll('.o_popover').length", scheme,
                                 'phone', 'popovers after a tap on the avatar')

    # -- M13 to M23: the Week range (S3 to S5) --------------------------------------------------

    def test_m13_m23_week(self):
        self.demo_world()
        probes = ['M13', 'M14', 'M15', 'M16', 'M17', 'M18', 'M19', 'M20', 'M21', 'M22', 'M23']
        for scheme in self.schemes(probes):
            with self.open(scheme):
                self.loaded()
                self.choose_range('week')
                self.mouse('mouseMoved', 1000, 123, buttons=0)
                self.settle(1500)
                folded = "document.querySelectorAll('.o_tl_col.o_tl_folded')"
                self.check('M13', f"{folded}[0]", scheme, 'desktop', 'the folded header, Sunday')
                self.check('M14', f"{folded}[1]", scheme, 'desktop', 'the folded header, Saturday')
                monday = "document.querySelector('.o_tl_col[data-date=\"2026-11-09\"]')"
                self.check('M15', monday, scheme, 'desktop', 'the header of Monday 9')
                self.check('M16', in_row('HRA Anita', '.o_tl_row_header'), scheme, 'desktop',
                           'the row header, two lines')
                self.check('M17', in_row('HRA Anita', LABEL), scheme, 'desktop', 'the label')
                self.check_text(in_row('HRA Anita', LABEL), '29h / 40h (11h left)', 'the text')
                self.check('M18', in_row('HRA Anita', '.o_tl_progress_fill'), scheme, 'desktop',
                           'the fill, 72.5 %')
                self.check_text(in_row('HRA Keith', LABEL), '0h / 24h', 'Keith\'s label')
                self.check('M19', cell_of_day('HRA Keith', '2026-11-12'), scheme, 'desktop',
                           'Keith\'s cell of Thursday 12')
                self.check_count('M20', f"{folded}.length", scheme, 'desktop', 'folded headers')
                # M23: the pointer resting on the bar of Anita
                self.rest_on(in_row('HRA Anita', '.o_tl_progress'), settle=1.5)
                self.wait("!!document.querySelector('.o-tooltip')", timeout=10)
                self.check_text("document.querySelector('.o-tooltip')", '29h/40h (72%)',
                                'the tooltip text')
                # the corners are those of the theme's tooltip role (a pill, 800 px), not the 11 px
                # of the original's tooltip (ruling T11-6, a concern in the report)
                self.check('M23', "document.querySelector('.o-tooltip')", scheme, 'desktop',
                           'the tooltip of the bar',
                           skip=('border-top-left-radius', 'border-top-right-radius',
                                 'border-bottom-left-radius', 'border-bottom-right-radius'))
                self.mouse('mouseMoved', 1000, 123, buttons=0)
                self.settle(500)
                # M21, M22: a click on the folded header of Sunday 8
                self.real_click(f"{folded}[0]", settle=1.5)
                self.check('M21', "document.querySelector('.o_tl_col[data-date=\"2026-11-08\"]')",
                           scheme, 'desktop', 'the header of Sunday 8 opened')
                self.check_count('M22', f"{folded}.length", scheme, 'desktop',
                                 'folded headers after the click')

    def test_m69_shift_click_on_a_folded_header(self):
        self.demo_world()
        for scheme in self.schemes(['M69']):
            with self.open(scheme):
                self.loaded()
                self.choose_range('week')
                folded = "document.querySelectorAll('.o_tl_col.o_tl_folded')"
                self.real_click(f"{folded}[0]", modifiers=8, settle=1.5)
                self.check_count('M69', f"{folded}.length", scheme, 'desktop',
                                 'folded headers after Shift')

    # -- M54 to M58, M70, M71: rows, paging and the helper --------------------------------------

    def test_m57_m58_paging(self):
        self.demo_world()
        for scheme in self.schemes(['M57', 'M58']):
            with self.open(scheme):
                self.loaded()
                rows = f"{ROW_EL}.length"
                self.check_count('M58', rows, scheme, 'desktop', 'rows of the first page')
                self.act("document.querySelector('.o_pager_next').click()")
                self.check_count('M57', rows, scheme, 'desktop', 'rows of the second page')

    def test_m54_m56_helper(self):
        self.demo_world()
        for scheme in self.schemes(['M54', 'M56']):
            with self.open(scheme):
                self.loaded()
                self.search('HRA Beth')
                self.wait("!!document.querySelector('.o_hag_helper')")
                self.settle(1500)
                self.dump('M54', '.o_hag_helper', '.o_tl_box', '.o_tl_renderer', '.o_tl_grid',
                          '.o_content', '.o_tl_controls', '.o_control_panel', '.o_tl_title_cell',
                          '.o_tl_row')
                # the helper starts under the one row and runs to the window's bottom; the table's
                # box starts 15 px (phone: 49 px) above the end of the column headers (ruling
                # T11-7): its place and width are compared, with the bottom edge
                self.check('M54', "document.querySelector('.o_hag_helper')", scheme, 'desktop',
                           'the helper', skip=('geometry.y', 'geometry.height'))
                self.check_bottom('document.querySelector(\'.o_hag_helper\')', 900, 'M54')
                headers = f"{ROW_EL}.filter((r) => r.querySelector('.o_tl_row_header')).length"
                self.check_count('M56', headers, scheme, 'desktop', 'row headers')

    def test_m55_helper_phone(self):
        self.demo_world()
        for scheme in self.schemes(['M55'], 'phone'):
            with self.open(scheme, 'phone'):
                self.loaded('phone')
                self.search('HRA Beth', phone=True)
                self.wait("!!document.querySelector('.o_hag_helper')")
                self.settle(1500)
                self.dump('M55', '.o_hag_helper', '.o_tl_box', '.o_tl_renderer', '.o_content',
                          '.o_tl_controls', '.o_control_panel', '.o_tl_title_cell', '.o_tl_row')
                self.check('M55', "document.querySelector('.o_hag_helper')", scheme, 'phone',
                           'the helper on the phone', skip=('geometry.y', 'geometry.height'))
                # the table's helper ends at the window's bottom (844); Complete's phone page is
                # taller than the window once the search bar is open and the helper follows the
                # page's end (ruling T11-7)

    def test_m68_m60_m61_ranges_and_helper(self):
        """M59 to M61, M67, M68: the range chosen around today (R6), and no helper on a far week
        with twenty empty rows (R20)."""
        self.demo_world()
        probes = ['M59', 'M60', 'M61', 'M67', 'M68']
        for scheme in self.schemes(probes):
            with self.open(scheme):
                self.loaded()
                title = 'A - 3h 30m'
                pills = ("[...document.querySelectorAll('.o_tl_pill_title')]"
                         f".filter((e) => e.textContent.trim() === {json.dumps(title)}).length")
                self.choose_range('month')
                self.check_scroll('M59', scheme, 'desktop', 'the grid of the Month range')
                self.choose_range('week')
                self.check_count('M60', pills, scheme, 'desktop', 'pills in the week of today')
                self.choose_range('month')
                self.step(1)
                self.choose_range('week')
                self.check_count('M61', pills, scheme, 'desktop', 'pills in the week of 13 Dec')
                self.check_count('M68', "document.querySelectorAll('.o_hag_helper').length",
                                 scheme, 'desktop', 'helpers on a week of empty rows')
                # M67: the Quarter range scrolled to its end, then Week
                self.choose_range('quarter')
                self.js("(() => { const g = document.querySelector('.o_tl_renderer'); "
                        "g.scrollLeft = g.scrollWidth; })()")
                self.settle(900)
                self.choose_range('week')
                # the Week range around today again (the Quarter range showed today)
                self.check_count('M67', pills, scheme, 'desktop', 'pills, week after the quarter')

    def test_m65_m66_quarter_scroll(self):
        self.demo_world()
        for scheme in self.schemes(['M65', 'M66']):
            with self.open(scheme):
                self.loaded()
                self.choose_range('quarter')
                self.settle(1500)
                self.real_click(in_row('HRA Anita', '.o_hrg_avatar'), settle=1.2)
                self.press_escape()
                self.check_scroll('M65', scheme, 'desktop', 'after a click on the avatar')
                self.real_click(in_row('HRA Anita', '.o_tl_row_label'), settle=1.5)
                self.check_scroll('M66', scheme, 'desktop', 'after a click on the name')

    def test_m70_team_officer(self):
        like = self.demo_world()
        officer = self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'HRA Officer', 'login': 'hra_officer', 'password': 'hra_officer',
            'email': 'hra_officer@example.com', 'tz': TZ, 'lang': 'en_US',
            'group_ids': [(6, 0, [
                self.env.ref('base.group_user').id,
                self.env.ref('hr_attendance.group_hr_attendance_officer').id,
            ])],
        })
        like['HRA Marc'].user_id = officer
        for name in ('HRA Abigail', 'HRA Anita', 'HRA Jennie', 'HRA Keith'):
            like[name].attendance_manager_id = officer
        # the officer's own employee, when the Community made one with the user
        self.env['hr.employee'].search(
            [('user_id', '=', officer.id), ('id', '!=', like['HRA Marc'].id)]
        ).write({'active': False})
        for scheme in self.schemes(['M70']):
            with self.open(scheme, login='hra_officer'):
                self.loaded()
                self.check_count('M70', f"{ROW_EL}.length", scheme, 'desktop',
                                 'the rows of a team officer')

    def test_m71_archived_filter(self):
        self.demo_world()
        for scheme in self.schemes(['M71']):
            with self.open(scheme):
                self.loaded()
                self.pick_filter('Archived Employees')
                self.wait("!!document.querySelector('.o_hag_helper')")
                self.check_count('M71', "document.querySelectorAll('.o_hag_helper').length",
                                 scheme, 'desktop', 'helpers with the Archived Employees filter')

    # -- M72 to M75: what a crossing attendance counts (decision D2) ----------------------------

    def test_m74_m75_day_before(self):
        """M74, M75 (decision D2): Day of Tuesday 10 November, Anita's 24-hour attendance counts
        its part from 4:00 to 24:00, Jennie's night its part from 20:00 to 24:00; and the Day of
        11 November counts 9h for Anita (M4) and 8h for Jennie."""
        self.demo_world()
        for scheme in self.schemes(['M24', 'M26', 'M28', 'M25', 'M27', 'M29']):
            with self.open(scheme):
                self.loaded()
                self.check_worked('ANITA_DAY_11', 'HRA Anita', scheme)
                self.check_worked('JENNIE_DAY_11', 'HRA Jennie', scheme)
                self.step(-1)
                self.check_worked('M74', 'HRA Anita', scheme)
                self.check_worked('M75', 'HRA Jennie', scheme)

    def test_m72_m73_night_across_the_month(self):
        """M72, M73 (decision D2): "Gantt Night", 30 November 20:00 to 1 December 4:00 local."""
        make_prepared(self.env, night=True, demo_schedule=self.schedule)
        self.archive_others('Gantt ')
        for scheme in self.schemes(['M26', 'M28', 'M29']):
            with self.open(scheme):
                self.loaded()
                self.search('Gantt Night')
                self.choose_range('month')
                self.check_worked('M72', 'Gantt Night', scheme)
                self.step(1)
                self.check_worked('M73', 'Gantt Night', scheme)


@tagged('post_install', '-at_install')
class TestHrRowsPreparedProbes(HrProbes):
    """The prepared employees of acceptance.md, found by the search "Gantt" (ruling T11-2)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.archive_others(PREFIX)

    def setUp(self):
        super().setUp()
        make_prepared(self.env, demo_schedule=self.schedule)
        self.env.flush_all()

    def search_gantt(self, phone=False):
        self.loaded('phone' if phone else 'desktop')
        self.search('Gantt', phone=phone)

    def label_probes(self, scheme, viewport):
        """M24 to M36 of the Day range of Monday 9 November."""
        if viewport == 'desktop':
            over = 'Gantt Over'
            self.check('M24', in_row(over, LABEL), scheme, viewport, 'Over, label')
            self.check_text(in_row(over, LABEL), '10h / 8h (+2h)', 'Over, text')
            self.check('M25', in_row(over, '.o_tl_progress_fill'), scheme, viewport, 'Over, fill')
            double = 'Gantt Double'
            self.check('M26', in_row(double, LABEL), scheme, viewport, 'Double, label')
            self.check_text(in_row(double, LABEL), '18h / 8h (+10h)', 'Double, text')
            self.check('M27', in_row(double, '.o_tl_progress_fill'), scheme, viewport,
                       'Double, fill')
            exact = 'Gantt Exact'
            self.check('M28', in_row(exact, LABEL), scheme, viewport, 'Exact, label')
            self.check_text(in_row(exact, LABEL), '8h / 8h', 'Exact, text')
            self.check('M29', in_row(exact, '.o_tl_progress_fill'), scheme, viewport,
                       'Exact, fill')
            tracked = 'Gantt Tracked'
            self.check('M30', in_row(tracked, LABEL), scheme, viewport, 'Tracked, label')
            self.check_text(in_row(tracked, LABEL), '0h / 8h', 'Tracked, text')
            free = 'Gantt Free'
            self.check('M31', in_row(free, LABEL), scheme, viewport, 'Free, label')
            self.check_text(in_row(free, LABEL), '0h', 'Free, text')
            self.check_count(
                'M32', "document.querySelectorAll('.o_tl_progress:not(.o_hag_bar_space)').length",
                scheme, viewport, 'bars')
            self.check_count(
                'M33', "[...document.querySelectorAll('.o_tl_progress_label')]"
                ".filter((e) => e.getAttribute('data-tooltip')).length", scheme, viewport,
                'labels with a tooltip')
            self.check('M34', in_row(free, '.o_tl_row_header'), scheme, viewport,
                       'Free, row header')
        else:
            self.check('M35', in_row('Gantt Over', LABEL), scheme, viewport, 'Over, short label')
            self.check_text(in_row('Gantt Over', LABEL), '+2h', 'Over, short text')
            self.check('M36', in_row('Gantt Exact', LABEL), scheme, viewport,
                       'Exact, short label')
            self.check_text(in_row('Gantt Exact', LABEL), '8h', 'Exact, short text')

    def test_m24_m34_labels(self):
        for scheme in self.schemes(['M24', 'M25', 'M26', 'M27', 'M28', 'M29', 'M30', 'M31',
                                    'M32', 'M33', 'M34']):
            with self.open(scheme):
                self.search_gantt()
                self.step(-1, 2)
                self.mouse('mouseMoved', 1000, 123, buttons=0)
                self.settle(1000)
                self.label_probes(scheme, 'desktop')

    def test_m35_m36_labels_phone(self):
        for scheme in self.schemes(['M35', 'M36'], 'phone'):
            with self.open(scheme, 'phone'):
                self.search_gantt(phone=True)
                self.step(-1, 2)
                self.label_probes(scheme, 'phone')

    def test_m37_m43_month(self):
        probes = ['M37', 'M38', 'M39', 'M40', 'M41', 'M42', 'M43']
        for scheme in self.schemes(probes):
            with self.open(scheme):
                self.search_gantt()
                self.choose_range('month')
                self.mouse('mouseMoved', 1000, 123, buttons=0)
                self.settle(1500)
                hourly = 'Gantt Hourly'
                self.check_count(
                    'M37', f"{cells_of(hourly)}.filter((c) => c.style.backgroundImage"
                    ".includes('325deg')).length", scheme, 'desktop', 'diagonal cells')
                self.check('M38', cell_of_day(hourly, '2026-11-06'), scheme, 'desktop',
                           'the cell of Friday 6, diagonal')
                lunch = pills_of('Gantt Lunch')
                for probe, index in (('M39', 0), ('M42', 1), ('M40', 2), ('M41', 3), ('M43', 4)):
                    self.check_outer(probe, f"{lunch}[{index}]", scheme, 'desktop',
                                     f'Lunch pill {index}')

    def test_m44_m49_quarters(self):
        probes = ['M44', 'M45', 'M46', 'M47', 'M48', 'M49', 'D1_QUARTER_WED', 'D1_LUNCH_WED',
                  'D1_LUNCH_FRI']
        for scheme in self.schemes(probes):
            with self.open(scheme):
                self.search_gantt()
                self.choose_range('week')
                self.step(-1)
                self.mouse('mouseMoved', 1000, 123, buttons=0)
                self.settle(1500)
                quarter, lunch = pills_of('Gantt Quarter'), pills_of('Gantt Lunch')
                self.check_outer('M44', f"{quarter}[0]", scheme, 'desktop', 'Quarter, Monday 2')
                self.check_outer('M45', f"{quarter}[1]", scheme, 'desktop', 'Quarter, Tuesday 3')
                self.check_outer('D1_QUARTER_WED', f"{quarter}[2]", scheme, 'desktop',
                                 'Quarter, Wednesday 4')
                self.check_outer('M46', f"{lunch}[0]", scheme, 'desktop', 'Lunch, Monday 2')
                self.check_outer('D1_LUNCH_WED', f"{lunch}[2]", scheme, 'desktop',
                                 'Lunch, Wednesday 4')
                self.check_outer('M47', f"{lunch}[3]", scheme, 'desktop', 'Lunch, Thursday 5')
                self.check_outer('D1_LUNCH_FRI', f"{lunch}[4]", scheme, 'desktop',
                                 'Lunch, Friday 6')
                self.check_quarters('M48', cell_of_day('Gantt Hourly', '2026-11-02'), scheme,
                                    'Hourly, Monday 2, quarters')
                self.check_count('M49', "document.querySelectorAll('.o_tl_col.o_tl_folded').length",
                                 scheme, 'desktop', 'folded headers')

    def test_m50_m53_open_attendance(self):
        for scheme in self.schemes(['M50', 'M52', 'M53']):
            with self.open(scheme):
                self.search_gantt()
                self.mouse('mouseMoved', 1000, 123, buttons=0)
                self.settle(1500)
                self.check_outer('M50', in_row('Gantt Open', '.o_tl_pill'), scheme, 'desktop',
                                 'the open pill')
                self.check('M52', f"{cells_of('Gantt Hourly')}[12]", scheme, 'desktop',
                           'Hourly, the 12 pm cell')
                self.check('M53', f"{cells_of('Gantt Hourly')}[8]", scheme, 'desktop',
                           'Hourly, the 8 am cell')

    def test_m51_open_attendance_phone(self):
        for scheme in self.schemes(['M51'], 'phone'):
            with self.open(scheme, 'phone'):
                self.search_gantt(phone=True)
                self.check_outer('M51', in_row('Gantt Open', '.o_tl_pill'), scheme, 'phone',
                                 'the open pill on the phone')
