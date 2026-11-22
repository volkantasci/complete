# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of the measured values of slice 002e (spec.md, "Measured values", M1 to M75): the time-off
views in a real headless Chrome, compared with the table of the original by machine
(``probe_values``).

Run only these: ``--test-tags /hr_holidays_gantt:TestTimeOffProbesDemo,/hr_holidays_gantt:
TestTimeOffProbesRoles,/hr_holidays_gantt:TestTimeOffProbesFlexible,/hr_holidays_gantt:
TestTimeOffProbesStates,/hr_holidays_gantt:TestTimeOffProbesAttendance``. The dark scheme needs
``web_enterprise``; without it only the light probes run. The browser clock is Wednesday 11
November 2026, 10:00:05 UTC (11:00 in Brussels, the browser's zone), and runs on; the window is
1600 x 900 (phone 390 x 844, touch).

Five worlds, because their rows cannot share one page:

* the *demo-like* world: the 22 demo employees with the demo's names and the six leaves'
  holders of acceptance.md (the other employees of the database move to another company):
  M1 to M20, M26 to M32, M36 to M41, M65 to M67 in the leave view (Overview as administrator);
* the *roles* world: that world seen as a Time Off employee in the report view (M21 to M25,
  M33 to M35, M42, M43); Anita Oliver's record number is 3 modulo 12, so that the colour of the
  employee is the table's;
* the *flexible* world (search "Toff"): M44 to M50 in the leave view, M51 to M55 in the
  attendance management view;
* the *states* world (M60 to M64, M75);
* the *attendance* world: the demo-like world in the attendance management view (M56 to M59) and
  the notes on 002d3 (M68 to M74). Skipped without ``hr_attendance_gantt``.

Where a value depends on a known difference that the spec lists under "Out of scope" or a ruling,
the probe says so where it applies a known difference (``SHELL``).
"""
import json
import logging
import re
import unittest

from odoo.addons.test_web_gantt.tests.timeline_probe import (
    CLOCK_TEMPLATE,
    TimelineProbeCase,
    compare_value,
)
from odoo.tests import HttpCase, tagged

from . import time_off_fixtures as fx
from .probe_values import TIME_OFF_PROBES, measured

_logger = logging.getLogger(__name__)

TZ = fx.TZ
OVERVIEW = 'hr_holidays_gantt.action_hr_holidays_overview'
MANAGEMENT = 'hr_holidays.hr_leave_action_action_approve_department'
ATTENDANCE = 'hr_attendance.hr_attendance_action'
# five seconds after the hour: a load at exactly 11:00:00 would end an open pill at 11:00
CLOCK = CLOCK_TEMPLATE % '2026, 10, 11, 10, 0, 5'
SCHEMES = ('light', 'dark')
VIEWPORTS = ('desktop', 'phone')
AWAY = 'Toff Elsewhere'
KNOWN = {row[0] for row in TIME_OFF_PROBES}
# what the probe classes compared and what they left out whole, for the coverage test; the
# classes that ran their set-up
COMPARED = set()
SKIPPED = set()
STARTED = set()
LABEL = '.o_tl_progress_label'
# Anita Oliver's record number modulo 12 is the colour index of the report's pills (M21)
ANITA_COLOUR = 3

# Known differences of the Overview page, compared with the difference applied and logged as
# ``SHELL-DIFFERENCE`` (a spec question):
# * desktop: the original's search field is 34 px tall there (no view switcher in the row) where
#   the shell's field is 37 px high at least (``.o_cp_searchview`` of web_enterprise's control
#   panel, a rule of every page), so the original's bar and grid lie 3 px *higher* than
#   Complete's: the desktop probes that get the offset are M1 to M20, M26 to M32, M40 and M76 to
#   M80, compared 3 px lower (the table's M81 is not compared; the other probes read no height
#   that the offset moves);
# * phone (decision D3, R23 point 1): the leave view's control bar grows to its two lines as the
#   report view's does, so the grid starts 43 px lower than on the original (y 205, not 162): the
#   phone readings of the leave view below the bar (M1, M2, M4 to M7, M11, M15 to M17, M19, M40,
#   M44, M45) are compared 43 px lower; M14 is compared with the report view's range button (M90).
# * both viewports: a geometry value is compared within half a pixel (the framework's
#   ``GEOMETRY_TOLERANCE``), because Chrome places boxes on a grid of half pixels and the table's
#   values are those of another layout; the label, the avatar, the card and its parts lie half a
#   pixel less low than the rows' other boxes, so those probes add the half pixel to the offset
#   (``dy + .5``) and the allowance is not spent on the offset itself.
SHELL = {'desktop': -3, 'phone': -43}

INSTALL_COUNTER = """(() => {
    window.__hp = { requests: 0, responses: 0 };
    const { rpcBus } = odoo.loader.modules.get('@web/core/network/rpc');
    const isData = (ev) => ev.detail?.data?.params?.method === 'get_gantt_data';
    rpcBus.addEventListener('RPC:REQUEST', (ev) => { if (isData(ev)) { window.__hp.requests++; } });
    rpcBus.addEventListener('RPC:RESPONSE', (ev) => {
        if (isData(ev)) { window.__hp.responses++; }
    });
})()"""

SIGNATURE = """JSON.stringify([
    [...document.querySelectorAll('.o_tl_col')].map((e) => e.dataset.date || ''),
    [...document.querySelectorAll('.o_tl_col_group_label')].map((e) => e.textContent.trim()),
    [...document.querySelectorAll('.o_tl_row_label')].map((e) => e.textContent.trim()),
])"""

ROW_EL = "[...document.querySelectorAll('.o_tl_row:not(.o_tl_total_row)')]"
FOLDED = "document.querySelectorAll('.o_tl_col.o_tl_folded')"
MODAL = ".modal:not(.o_inactive_modal)"


def row_js(name):
    return (f"{ROW_EL}.find((r) => r.querySelector('.o_tl_row_label')?.textContent.trim() === "
            f"{json.dumps(name)})")


def in_row(name, selector):
    return f"{row_js(name)}.querySelector({json.dumps(selector)})"


def pills_of(name):
    return (f"[...{row_js(name)}.querySelectorAll('.o_tl_pill')]"
            ".sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)")


def pill_js(name, title):
    """The pill of the row whose text reads ``title``."""
    return (f"[...{row_js(name)}.querySelectorAll('.o_tl_pill')].find((p) => p.querySelector("
            f"'.o_tl_pill_title')?.textContent.trim() === {json.dumps(title)})")


def cells_of(name):
    return (f"[...{row_js(name)}.querySelectorAll('.o_tl_cell')]"
            ".sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)")


def cell_of_day(name, date):
    """The first cell of the row that starts at the column of ``date``."""
    column = f"document.querySelector('.o_tl_col[data-date=\"{date}\"]')"
    return (f"{cells_of(name)}.find((c) => c.getBoundingClientRect().x >= "
            f"{column}.getBoundingClientRect().x - 1)")


def column_js(date):
    return f"document.querySelector('.o_tl_col[data-date=\"{date}\"]')"


class TimeOffProbeCase(TimelineProbeCase):
    """A page, the steps, the real input and the readings of the probes; it holds no test."""

    @classmethod
    def setUpClass(cls):
        # the host records of the timeline probes are not wanted here
        HttpCase.setUpClass.__func__(cls)
        cls.has_theme = bool(cls.env['ir.module.module'].search_count(
            [('name', '=', 'web_enterprise'), ('state', '=', 'installed')]))
        cls.admin = fx.find_admin(cls.env)
        cls.admin.write({'lang': 'en_US', 'tz': TZ})
        others = cls.env['res.lang'].search([('active', '=', True), ('code', '!=', 'en_US')])
        if others:
            cls.env['res.users'].with_context(active_test=False).search(
                [('lang', 'in', others.mapped('code'))]).write({'lang': 'en_US'})
            cls.env['res.partner'].with_context(active_test=False).search(
                [('lang', 'in', others.mapped('code'))]).write({'lang': 'en_US'})
            others.write({'active': False})
        cls.schedule = fx.find_schedule(cls.env)
        # the employees of a database with demo data, before the class makes any
        cls.preexisting = cls.env['hr.employee'].with_context(active_test=False).search([]).ids
        STARTED.add(cls.__name__)

    @classmethod
    def isolate(cls, keep=()):
        """The employees that existed before the class, but ``keep`` and the administrator's own,
        move to a company that is not one of the users' companies: the rows do not show them."""
        staff = cls.env['hr.employee'].with_context(active_test=False)
        others = staff.browse(cls.preexisting).filtered(
            lambda employee: employee.name not in keep and employee.user_id != cls.admin)
        if others:
            away = cls.env['res.company'].search([('name', '=', AWAY)], limit=1)
            away = away or cls.env['res.company'].create({'name': AWAY})
            kept = staff.browse(cls.preexisting) - others
            kept.write({'parent_id': False, 'coach_id': False})
            others.write({'company_id': away.id})
        cls.env.flush_all()

    @classmethod
    def clear_leaves_but_the_table(cls, world):
        """The demo data's own leaves of the other employees lie around the day it was loaded."""
        holders = {cls.world[name].id for name in fx.DEMO_LEAVES if name in cls.world}
        others = [employee.id for employee in world.values() if employee.id not in holders]
        leaves = cls.env['hr.leave'].with_context(active_test=False).with_user(cls.admin).search(
            [('employee_id', 'in', others)])
        leaves.unlink()

    @classmethod
    def no_attendance(cls, employees):
        cls.env['hr.attendance'].sudo().search(
            [('employee_id', 'in', [employee.id for employee in employees])]).unlink()
        cls.env.flush_all()

    @classmethod
    def build_demo_world(cls, anita_colour=None):
        """The 22 demo employees and the demo leaves; ``anita_colour`` gives Anita Oliver the
        record number that is that colour index modulo 12 (the demo's own Anita steps aside)."""
        if anita_colour is not None:
            staff = cls.env['hr.employee'].with_context(active_test=False)
            found = staff.search([('name', '=', 'Anita Oliver')])
            if found and found[0].id % 12 != anita_colour:
                # the demo's Anita steps aside: another name, another company
                away = cls.env['res.company'].search([('name', '=', AWAY)], limit=1)
                away = away or cls.env['res.company'].create({'name': AWAY})
                found.write({'name': 'Anita Oliver (aside)', 'company_id': away.id})
                found = staff.browse()
            if not found:
                last = cls.env['hr.employee'].with_context(active_test=False).search(
                    [], order='id desc', limit=1).id
                number = max(last, 100) + 1
                number += (anita_colour - number) % 12
                cls.env.cr.execute("SELECT setval('hr_employee_id_seq', %s, false)", [number])
                made = fx._employee(cls.env, 'Anita Oliver', cls.schedule)
                assert made.id % 12 == anita_colour, made.id
        cls.world = fx.make_demo_world(cls.env, cls.schedule)
        cls.isolate(keep=set(fx.DEMO_EMPLOYEES))
        cls.clear_leaves_but_the_table(cls.world)
        # the card of the demo's Anita shows a job title, an e-mail and a phone number
        cls.world['Anita Oliver'].write({
            'job_title': 'Head of Gantt', 'work_email': 'anita.oliver32@example.com',
            'work_phone': '+32 2 123 45 67',
        })
        cls.env.flush_all()

    # -- the page -------------------------------------------------------------------------------

    def schemes(self):
        return [scheme for scheme in SCHEMES if scheme == 'light' or self.has_theme]

    def open(self, scheme, viewport='desktop', action=OVERVIEW, login='admin', ready=None,
             touch=False):
        """The page. The table's values were taken without touch emulation (screens/index.md): only
        the tap of M36 asks for it."""
        if scheme == 'light':
            # a dark page of an earlier step of the test leaves the user's setting dark
            user = self.env['res.users'].search([('login', '=', login)], limit=1)
            self.env['res.users.settings']._find_or_create_for_user(user).color_scheme = 'light'
        return self.page(action, scheme, viewport, login=login, clock=CLOCK, timezone=TZ,
                         touch=touch, ready=ready or '.o_tl_renderer .o_tl_row')

    def loaded(self, ready="document.querySelectorAll('.o_tl_pill').length > 0"):
        """The page is drawn with its data."""
        self.wait(ready, timeout=60)
        self.js(INSTALL_COUNTER)
        self.browser._websocket_request('Emulation.setScrollbarsHidden', params={'hidden': True})
        self.js("document.head.appendChild(Object.assign(document.createElement('style'), "
                "{textContent: '* { scrollbar-width: none !important; }'}))")
        self.settle(900)

    def idle(self, extra=0.9):
        self.wait("window.__hp.responses >= window.__hp.requests", timeout=60)
        self.settle(int(extra * 1000))

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

    def remove_facet(self, text):
        has = ("[...document.querySelectorAll('.o_searchview_facet')]"
               f".find((e) => e.textContent.includes({json.dumps(text)}))")
        for _ in range(3):
            if not self.js(f"!!({has})"):
                break
            before = self.js("window.__hp.requests")
            self.js(f"{has}.querySelector('.o_facet_remove').click()")
            try:
                self.wait(f"window.__hp.requests > {before}", timeout=5)
            except AssertionError:
                pass
            self.idle()

    def pick_status(self, option):
        self.js("document.querySelector('.o_searchview_dropdown_toggler').click()")
        toggle = ("[...document.querySelectorAll('.o_filter_menu .o_accordion_toggle')]"
                  ".find((e) => e.textContent.trim() === 'Status')")
        self.wait(f"!!({toggle})")
        self.js(f"{toggle}.click()")
        item = ("[...document.querySelectorAll('.o_filter_menu .o_item_option')]"
                f".find((e) => e.textContent.trim() === {json.dumps(option)})")
        self.wait(f"!!({item})")
        before = self.js("window.__hp.requests")
        self.js(f"{item}.click()")
        self.wait(f"window.__hp.requests > {before}", timeout=30)
        self.js("document.querySelector('.o_search_bar_menu') && "
                "document.querySelector('.o_searchview_dropdown_toggler').click()")
        self.idle()

    def to_week(self):
        """The Week range of 15 to 21 November (one step after the week of today)."""
        self.choose_range('week')
        self.step(1)

    # -- real input -----------------------------------------------------------------------------

    def centre(self, element_js):
        box = self.geometry(element_js)
        return (box['geometry.x'] + box['geometry.width'] / 2,
                box['geometry.y'] + box['geometry.height'] / 2)

    def mouse(self, kind, x, y, **extra):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': kind, 'x': x, 'y': y, 'button': extra.pop('button', 'none'), **extra})

    def real_click(self, element_js, settle=0.9):
        x, y = self.centre(element_js)
        self.mouse('mouseMoved', x, y, buttons=0)
        self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
        self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
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

    @staticmethod
    def as_reported(probe, scheme, viewport='phone'):
        """The geometry rows of another probe, to compare an element with where that one lies."""
        return {prop: value for prop, value in measured(probe, viewport)[scheme].items()
                if prop.startswith('geometry.')}

    def check_scroll(self, probe, element_js, scheme, viewport, label):
        """The grid's sideways scroll (``scroll-left`` rows of M82 and M83), within a pixel."""
        self.assertIn(probe, KNOWN, f'{probe} is not a probe of the table')
        want = measured(probe, viewport).get(scheme)
        if not want:
            return
        got = self.js(f"({element_js}).scrollLeft")
        COMPARED.add((probe, scheme, viewport))
        with self.subTest(probe=probe, scheme=scheme, viewport=viewport, element=label):
            if abs(got - float(want['scroll-left'])) > 1:
                _logger.warning('PROBE-MISMATCH|%s|%s|%s|scroll-left|%s|%s|%s', probe, scheme,
                                viewport, want['scroll-left'], got, label)
            self.assertAlmostEqual(got, float(want['scroll-left']), delta=1, msg=f'{probe} {label}')

    def check(self, probe, element_js, scheme, viewport, label, skip=(), override=None, dy=0, dx=0):
        """Compare the element with the rows of ``probe`` of this scheme and viewport; a probe the
        table has for the other viewport only asks nothing here (desktop-only or phone-only).

        ``dy`` is a known vertical difference of the page (see ``SHELL``): Complete lies ``dy``
        pixels higher than the table's ``geometry.y``; it is logged as ``SHELL-DIFFERENCE``."""
        self.assertIn(probe, KNOWN, f'{probe} is not a probe of the table')
        expected = {prop: value for prop, value in measured(probe, viewport).get(scheme, {}).items()
                    if prop not in skip}
        if not expected:
            self.assertTrue(
                measured(probe, 'phone' if viewport == 'desktop' else 'desktop')
                or measured(probe, viewport).get(scheme),
                f'no value of {probe} in {scheme}/{viewport}')
            if measured(probe, viewport).get(scheme):
                _logger.warning('SHELL-DIFFERENCE|%s|%s|%s|left out|all|%s', probe, scheme,
                                viewport, label)
                SKIPPED.add((probe, scheme, viewport))
            return
        if dy and 'geometry.y' in expected:
            expected['geometry.y'] = str(float(expected['geometry.y']) - dy)
            _logger.warning('SHELL-DIFFERENCE|%s|%s|%s|geometry.y|%s px lower in the original',
                            probe, scheme, viewport, dy)
        left = [prop for prop in skip if prop in measured(probe, viewport).get(scheme, {})]
        if left:
            _logger.warning('SHELL-DIFFERENCE|%s|%s|%s|left out|%s|%s', probe, scheme, viewport,
                            ','.join(left), label)
        if dx and 'geometry.x' in expected:
            expected['geometry.x'] = str(float(expected['geometry.x']) - dx)
            _logger.warning('SHELL-DIFFERENCE|%s|%s|%s|geometry.x|%s px further left in the '
                            'original', probe, scheme, viewport, dx)
        expected.update(override or {})
        COMPARED.add((probe, scheme, viewport))
        self.probe(probe, element_js, scheme, viewport, expected, label)
        # the half pixel the comparison allows must not hide a residue of the page's offset
        edges = [prop for prop in expected if prop in ('geometry.x', 'geometry.y')]
        found = self.read(element_js, edges) if edges else None
        for prop in edges if found else ():
            residue = float(found[prop]) - float(expected[prop])
            if abs(residue) > .05:
                _logger.warning('PROBE-RESIDUE|%s|%s|%s|%s|%.3f px|%s', probe, scheme, viewport,
                                prop, residue, label)

    def check_count(self, probe, count_js, scheme, viewport, label):
        self.assertIn(probe, KNOWN, f'{probe} is not a probe of the table')
        rows = measured(probe, viewport).get(scheme)
        if not rows:
            self.assertTrue(
                measured(probe, 'phone' if viewport == 'desktop' else 'desktop'),
                f'no value of {probe} in {scheme}/{viewport}')
            return
        want = int(rows['count'])
        got = self.js(count_js)
        COMPARED.add((probe, scheme, viewport))
        with self.subTest(probe=probe, scheme=scheme, viewport=viewport, element=label):
            if got != want:
                _logger.warning('PROBE-MISMATCH|%s|%s|%s|count|%s|%s|%s', probe, scheme, viewport,
                                want, got, label)
            self.assertEqual(got, want, f'{probe} {scheme}/{viewport} {label}')

    def check_text(self, element_js, wanted, label):
        got = self.js(f"({element_js}).textContent.replace(/\\s+/g, ' ').trim()")
        with self.subTest(text=label):
            self.assertEqual(got, wanted, label)

    @staticmethod
    def stops_of(gradient):
        stops = []
        for colour_text, first, second in re.findall(
                r'(rgba?\([^)]*\)|transparent)(?:\s+([\d.]+)%)?(?:\s+([\d.]+)%)?', gradient):
            for position in (first, second):
                if position != '':
                    stops.append((float(position), colour_text))
        return stops

    def check_cell(self, probe, element_js, scheme, viewport, label, quarters=False):
        """A cell: its background colour and image (M46 to M57). With ``quarters`` the image is
        the four quarters of the quarter-day precision: the colour of each quarter is compared
        (the table's stops at 24 % and 25 % and the framework's draw the same hard edges)."""
        if not quarters:
            return self.check(probe, element_js, scheme, viewport, label)
        self.check(probe, element_js, scheme, viewport, label, skip=('background-image',))
        want = measured(probe, viewport)[scheme]['background-image']
        got = self.js(f"getComputedStyle({element_js}).backgroundImage")

        def quarter_colours(text):
            stops = self.stops_of(text)
            if not stops:
                return [None] * 4
            found = []
            for middle in (12.5, 37.5, 62.5, 87.5):
                found.append(([c for p, c in stops if p <= middle] or [stops[0][1]])[-1])
            return found

        want_q, got_q = quarter_colours(want), quarter_colours(got)
        with self.subTest(probe=probe, scheme=scheme, element=label, prop='quarters'):
            why = None
            for index, (a, b) in enumerate(zip(want_q, got_q, strict=True)):
                if a is None or b is None:
                    if a != b:
                        why = f'quarter {index}: {b} instead of {a}'
                elif compare_value('background-color', a, b):
                    why = f'quarter {index}: {b} instead of {a}'
            if why:
                _logger.warning('PROBE-MISMATCH|%s|%s|%s|background-image|%s|%s|%s', probe,
                                scheme, viewport, want, got, label)
            self.assertIsNone(why, f'{probe} {scheme}: {got} instead of {want}')


# ------------------------------------------------------------------------------------------------
# the demo-like world, the leave view


@tagged('post_install', '-at_install')
class TestTimeOffProbesDemo(TimeOffProbeCase):
    """The 22 demo employees (Overview as administrator): M1 to M20, M26 to M32, M36 to M41."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.build_demo_world()

    def anita(self, selector):
        return in_row('Anita Oliver', selector)

    # -- M1 to M15: the Month range ---------------------------------------------------------------

    def month_probes(self, scheme, viewport):
        anita, dy = 'Anita Oliver', SHELL[viewport]

        def check(*args, **kwargs):
            kwargs.setdefault('dy', dy)
            return self.check(*args, **kwargs)

        check('M1', pill_js(anita, 'PTO 4 days'), scheme, viewport, 'the pill "PTO 4 days"')
        check('M2', pill_js(anita, '1d'), scheme, viewport, 'the one-day pill')
        check('M3', pill_js('Mitchell Admin', 'CTO 3 days'), scheme, viewport, 'CTO 3 days')
        check('M4', pill_js('Mitchell Admin', 'STO 3 days'), scheme, viewport, 'STO 3 days')
        # the label and the avatar lie half a pixel less low than the rows' other boxes (the
        # table's value 261.5 and 262 on a half-pixel grid): the residue is part of the offset
        half = .5
        check('M5', self.anita(LABEL), scheme, viewport, 'the hours label', dy=dy + half)
        self.check_text(self.anita(LABEL), '80h', 'Anita Oliver\'s hours label')
        check('M6', self.anita('.o_tl_row_header'), scheme, viewport, 'the row header')
        check('M7', self.anita('.o_hrg_avatar'), scheme, viewport, 'the avatar', dy=dy + half)
        check('M8', cell_of_day(anita, '2026-11-02'), scheme, viewport, 'the cell of Monday 2')
        check('M9', cell_of_day(anita, '2026-11-06'), scheme, viewport, 'the cell of Friday 6')
        check('M10', f"{FOLDED}[0]", scheme, viewport, 'the folded header')
        check('M11', "document.querySelector('.o_tl_total_row .o_tl_row_header')", scheme,
              viewport, 'the total row header')
        self.check_text("document.querySelector('.o_tl_total_row .o_tl_row_header')", 'Total',
                        'the total row header')
        self.check_count('M12', f"{ROW_EL}.length", scheme, viewport, 'employee rows')
        self.check_count('M13', "document.querySelectorAll('.o_tl_progress').length", scheme,
                         viewport, 'progress bars')
        # on the phone the range button lies where the report view's does (M90, R23 point 1)
        self.check('M14', "document.querySelector('.o_tl_range_button')", scheme, viewport,
                   'the range button', dy=dy if viewport == 'desktop' else 0,
                   override=self.as_reported('M90', scheme) if viewport == 'phone' else None)
        self.check_text("document.querySelector('.o_tl_range_button')", 'Month', 'the range')
        check('M15', column_js('2026-11-11'), scheme, viewport, 'the header of today')
        # the control bar: 58 px tall in the leave view on the desktop, its controls 4.5 px below
        # its top, the period line 1 px below the bar (R6); the phone's bar is R23 point 1's
        check('M77', "document.querySelector('.o_tl_controls')", scheme, viewport,
              'the control bar')
        check('M78', "document.querySelector('.o_tl_step_buttons')", scheme, viewport,
              'the previous and next buttons')
        check('M79', "document.querySelector('.o_tl_today')", scheme, viewport, 'Today')
        check('M80', "document.querySelector('.o_tl_col_group')", scheme, viewport,
              'the period line')

    def test_m01_m15_month(self):
        for viewport in VIEWPORTS:
            for scheme in self.schemes():
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.open(scheme, viewport):
                    self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                    self.mouse('mouseMoved', 1000, 123, buttons=0)
                    self.settle(500)
                    self.check_scroll('M82', "document.querySelector('.o_tl_renderer')", scheme,
                                      viewport, 'the grid opens on today')
                    self.month_probes(scheme, viewport)

    def test_m16_m18_week(self):
        for viewport in VIEWPORTS:
            for scheme in self.schemes():
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.open(scheme, viewport):
                    self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                    grid = "document.querySelector('.o_tl_renderer')"
                    self.choose_range('week')
                    self.check_scroll('M83', grid, scheme, viewport, 'the Week range')
                    self.step(1)
                    self.check_scroll('M83', grid, scheme, viewport, 'after Next')
                    self.mouse('mouseMoved', 1000, 123, buttons=0)
                    self.settle(800)
                    self.check('M16', pill_js('Anita Oliver', 'PTO 1d'), scheme, viewport,
                               'the pill "PTO 1d"', dy=SHELL[viewport])
                    self.check('M17', in_row('Mitchell Admin', LABEL), scheme, viewport,
                               'the hours label')
                    self.check_text(in_row('Mitchell Admin', LABEL), '16h', 'Mitchell\'s label')
                    self.check('M18', column_js('2026-11-16'), scheme, viewport,
                               'the header of Monday 16', dy=SHELL[viewport])
                    self.check('M76', f"{column_js('2026-11-16')}.querySelector('.o_tl_col_title')",
                               scheme, viewport, 'the text of the header of Monday 16',
                               dy=SHELL[viewport])

    def test_m19_m20_quarter(self):
        for viewport in VIEWPORTS:
            for scheme in self.schemes():
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.open(scheme, viewport):
                    self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                    self.choose_range('quarter')
                    self.mouse('mouseMoved', 1000, 123, buttons=0)
                    self.settle(800)
                    self.check('M19', in_row('Abigail Peterson', LABEL), scheme, viewport,
                               'the hours label',
                               dy=SHELL[viewport] + .5)
                    self.check_text(in_row('Abigail Peterson', LABEL), '528h', 'the label')
                    self.check('M20', pill_js('Sharlene Rhodes', 'PTO 5 days'), scheme, viewport,
                               'the pill "PTO 5 days"', dy=SHELL[viewport])

    # -- M26 to M32, M36: the card and the tap -----------------------------------------------------

    def test_m26_m32_card(self):
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.open(scheme):
                self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                self.real_click(self.anita('.o_hrg_avatar'), settle=1.5)
                self.wait("!!document.querySelector('.o_popover .o_hhg_card_band')")
                self.settle(800)
                popover = "document.querySelector('.o_popover')"
                self.check('M26', popover, scheme, 'desktop', 'the card', dy=SHELL['desktop'] + .5)
                self.check('M27', "document.querySelector('.o_hhg_card_band')", scheme, 'desktop',
                           'the band', dy=SHELL['desktop'] + .5)
                self.check('M28', "document.querySelector('.o_hhg_card_schedule')", scheme,
                           'desktop', 'the schedule button', dy=SHELL['desktop'] + .5)
                self.check_text("document.querySelector('.o_hhg_card_schedule')", '40 h / Week',
                                'the schedule button')
                self.check('M29', "document.querySelector('.o_hhg_card_version')", scheme,
                           'desktop', 'the pencil', dy=SHELL['desktop'] + .5)
                line = "document.querySelector('.o_hhg_card_line')"
                self.check('M30', line, scheme, 'desktop', 'the summary line',
                           dy=SHELL['desktop'] + .5)
                self.check_text(line, 'Legal leave employee: 11 days /9 days', 'the line')
                self.check('M31', "document.querySelector('.o_hhg_card_taken')", scheme,
                           'desktop', 'the time taken')
                self.check('M32', "document.querySelector('.o_hhg_card_left')", scheme, 'desktop',
                           'the time left')

    def test_m36_tap_on_the_phone(self):
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.open(scheme, 'phone', touch=True):
                self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                self.finger_tap(self.anita('.o_hrg_avatar'))
                self.settle(1500)
                self.check_count('M36', "document.querySelectorAll('.o_popover').length", scheme,
                                 'phone', 'cards after a tap on the avatar')

    # -- M37, M38: the gear -----------------------------------------------------------------------

    def test_m37_m38_gear(self):
        gear = "document.querySelectorAll('.o_cp_action_menus .dropdown-toggle')"
        for viewport in VIEWPORTS:
            for scheme in self.schemes():
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.open(scheme, viewport):
                    self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                    if viewport == 'desktop':
                        self.real_click(f"{gear}[0]", settle=1)
                        self.wait("document.querySelectorAll('.o-dropdown--menu "
                                  ".dropdown-item').length > 0")
                        self.check_count(
                            'M37', "document.querySelectorAll('.o-dropdown--menu "
                                   ".dropdown-item').length", scheme, viewport,
                            'entries of the gear')
                    else:
                        self.check_count('M38', f"[...{gear}].filter((e) => "
                                         "e.getClientRects().length > 0).length", scheme,
                                         viewport, 'gear buttons')

    # -- M39 to M41: nothing found -----------------------------------------------------------

    def test_m39_m41_empty(self):
        for viewport in VIEWPORTS:
            for scheme in self.schemes():
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.open(scheme, viewport):
                    self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                    self.search('zzz', phone=viewport == 'phone')
                    self.settle(1500)
                    headers = f"{ROW_EL}.map((r) => r.querySelector('.o_tl_row_header'))"
                    self.check_count('M39', f"{headers}.length", scheme, viewport,
                                     'row headers')
                    self.check('M40', f"{headers}[0]", scheme, viewport, 'the empty row header',
                               dy=SHELL[viewport])
                    self.check_count(
                        'M41', "document.querySelectorAll('[class*=\"helper\"], "
                               ".o_view_nocontent').length", scheme, viewport, 'helpers')

    # -- M65 to M67: the original's texts, corrected by decision D1 ---------------------------

    def test_m65_m67_one_day_pills_under_a_state_filter(self):
        """The original reads "PTO 1d" / "STO 1d" under a state filter (M65, M66) and no "1d" alone
        (M67): decision D1 corrects it. Complete: six pills read "1d", none "PTO 1d" or "STO 1d"."""
        with self.open('light'):
            self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
            self.pick_status('Approved')
            self.settle(1000)
            titles = self.js("[...document.querySelectorAll('.o_tl_pill_title')]"
                             ".map((e) => e.textContent.trim())")
            self.assertEqual(titles.count('1d'), 6, titles)
            self.assertEqual(
                [t for t in titles if re.fullmatch(r'(PTO|STO|CTO) 1d', t)], [], titles)
            for title in ('PTO 4 days', 'STO 2 days', 'CTO 3 days'):
                self.assertIn(title, titles)


# ------------------------------------------------------------------------------------------------
# the roles world: the report view as a Time Off employee


@tagged('post_install', '-at_install')
class TestTimeOffProbesRoles(TimeOffProbeCase):
    """The demo-like world seen by "Toff Role Emp", a Time Off employee: M21 to M25, M33 to M35,
    M42, M43."""

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

    def report(self, scheme, viewport='desktop'):
        return self.open(scheme, viewport, login='toff_emp')

    def test_m21_m25_report_month(self):
        for viewport in VIEWPORTS:
            for scheme in self.schemes():
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.report(scheme, viewport):
                    self.loaded()
                    self.mouse('mouseMoved', 1000, 123, buttons=0)
                    self.settle(800)
                    self.check('M21', pill_js('Anita Oliver', '4 days'), scheme, viewport,
                               'the pill "4 days"')
                    self.check_count('M22', "document.querySelectorAll('.o_tl_progress_label')"
                                     ".length", scheme, viewport, 'hours labels')
                    self.check_count('M23', f"{ROW_EL}.length", scheme, viewport, 'employee rows')
                    self.check('M24', cell_of_day('Anita Oliver', '2026-11-02'), scheme,
                               viewport, 'the cell of Monday 2')
                    self.check_count('M25', "document.querySelectorAll('.o_cp_switch_buttons "
                                     ".o_switch_view').length", scheme, viewport,
                                     'switcher buttons')

    def test_m84_m93_report_control_bar(self):
        """The report view's bar follows its controls (M84, M85) and on the phone its two lines
        (M89 to M93): the layout decision D3 gives the leave view too."""
        for viewport in VIEWPORTS:
            for scheme in self.schemes():
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.report(scheme, viewport):
                    self.loaded()
                    self.mouse('mouseMoved', 1000, 123, buttons=0)
                    self.settle(800)
                    self.check('M84', "document.querySelector('.o_tl_controls')", scheme,
                               viewport, 'the control bar')
                    self.check('M85', "document.querySelector('.o_tl_col_group')", scheme,
                               viewport, 'the period line')
                    self.check('M89', "document.querySelector('.o_tl_step_buttons')", scheme,
                               viewport, 'the previous and next buttons')
                    self.check('M90', "document.querySelector('.o_tl_range_button')", scheme,
                               viewport, 'the range button')
                    self.check('M91', "document.querySelector('.o_tl_separator')", scheme,
                               viewport, 'the separator')
                    self.check('M92', "document.querySelector('.o_tl_today')", scheme, viewport,
                               'Today')
                    self.check('M93', "document.querySelector('.o_tl_gear')", scheme, viewport,
                               'the gear')

    def test_m33_m35_card_of_an_employee(self):
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.report(scheme):
                self.loaded()
                self.real_click(in_row('Anita Oliver', '.o_hrg_avatar'), settle=1.5)
                self.wait("!!document.querySelector('.o_popover .o_hhg_card_band')")
                self.settle(800)
                for probe, selector in (('M33', '.o_hhg_card_line'),
                                        ('M34', '.o_hhg_card_version'),
                                        ('M35', '.o_hhg_card_schedule')):
                    self.check_count(probe, f"document.querySelectorAll('{selector}').length",
                                     scheme, 'desktop', selector)

    def test_m42_m43_report_empty(self):
        for viewport in VIEWPORTS:
            for scheme in self.schemes():
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.report(scheme, viewport):
                    self.loaded()
                    self.search('zzz', phone=viewport == 'phone')
                    self.settle(1500)
                    headers = f"{ROW_EL}.map((r) => r.querySelector('.o_tl_row_header'))"
                    self.check_count('M42', f"{headers}.length", scheme, viewport,
                                     'row headers')
                    self.check_count(
                        'M43', "document.querySelectorAll('[class*=\"helper\"], "
                               ".o_view_nocontent').length", scheme, viewport, 'helpers')


# ------------------------------------------------------------------------------------------------
# the flexible world


@tagged('post_install', '-at_install')
class TestTimeOffProbesFlexible(TimeOffProbeCase):
    """"Toff Flexible" and "Toff Fixed" (search "Toff"): M44 to M50 in the leave view, M51 to M55 in
    the attendance management view."""

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

    def test_m44_m50_leave_view(self):
        for viewport in VIEWPORTS:
            for scheme in self.schemes():
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.open(scheme, viewport):
                    self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                    self.to_week()
                    self.search('Toff', phone=viewport == 'phone')
                    self.settle(1200)
                    flexible, fixed = 'Toff Flexible', 'Toff Fixed'
                    self.check('M44', in_row(flexible, LABEL), scheme, viewport, 'flexible label')
                    self.check_text(in_row(flexible, LABEL), '16h', 'Toff Flexible\'s label')
                    self.check('M45', in_row(fixed, LABEL), scheme, viewport, 'fixed label')
                    self.check_text(in_row(fixed, LABEL), '24h', 'Toff Fixed\'s label')
                    for probe, name, date, what in (
                            ('M46', flexible, '2026-11-16', 'Monday 16'),
                            ('M47', flexible, '2026-11-17', 'Tuesday 17'),
                            ('M48', flexible, '2026-11-18', 'Wednesday 18'),
                            ('M49', flexible, '2026-11-15', 'Sunday 15'),
                            ('M50', fixed, '2026-11-17', 'Tuesday 17 (fixed)')):
                        self.check(probe, cell_of_day(name, date), scheme, viewport,
                                   f'the cell of {what}')

    def attendance_week(self, scheme):
        page = self.open(scheme, action=ATTENDANCE, ready='.o_tl_renderer .o_tl_row')
        return page

    def test_m51_m55_attendance_view(self):
        if not self.has_attendance:
            self.skipTest('hr_attendance_gantt is not installed')
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.attendance_week(scheme):
                self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                self.to_week()
                self.search('Toff')
                self.settle(1200)
                flexible, fixed = 'Toff Flexible', 'Toff Fixed'
                self.check_cell('M51', cell_of_day(flexible, '2026-11-16'), scheme, 'desktop',
                                'Monday 16')
                self.check_cell('M52', cell_of_day(flexible, '2026-11-17'), scheme, 'desktop',
                                'Tuesday 17', quarters=True)
                self.check_cell('M53', cell_of_day(flexible, '2026-11-18'), scheme, 'desktop',
                                'Wednesday 18')
                self.check('M54', in_row(flexible, LABEL), scheme, 'desktop', 'flexible label')
                self.check_text(in_row(flexible, LABEL), '0h / 40h', 'Toff Flexible\'s label')
                self.check('M55', in_row(fixed, LABEL), scheme, 'desktop', 'fixed label')
                self.check_text(in_row(fixed, LABEL), '0h / 24h', 'Toff Fixed\'s label')


# ------------------------------------------------------------------------------------------------
# the states world


@tagged('post_install', '-at_install')
class TestTimeOffProbesStates(TimeOffProbeCase):
    """"Toff States": M60 to M64, M75."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.states = fx.make_states(cls.env, cls.schedule)
        cls.states.leave_manager_id = cls.admin
        cls.isolate(keep={'Toff States'})

    def test_m60_m63_m75_management(self):
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), \
                    self.open(scheme, action=MANAGEMENT, ready='.o_list_view'):
                self.settle(500)
                self.js("document.querySelector('.o_cp_switch_buttons .o_switch_view.o_gantt')"
                        ".click()")
                self.wait("!!document.querySelector('.o_tl_renderer .o_tl_row_header')",
                          timeout=30)
                self.loaded("!!document.querySelector('.o_tl_renderer .o_tl_row_header')")
                self.remove_facet('Waiting For Me')
                self.search('Toff States')
                self.to_week()
                self.settle(1500)
                pills = pills_of('Toff States')
                self.assertEqual(self.js(f"{pills}.length"), 4)
                for probe, index in (('M60', 0), ('M61', 1), ('M62', 2), ('M63', 3)):
                    self.check(probe, f"{pills}[{index}]", scheme, 'desktop', f'pill {index}')
                self.check('M75', in_row('Toff States', LABEL), scheme, 'desktop', 'the label')
                self.check_text(in_row('Toff States', LABEL), '32h', 'the label')

    def test_m64_overview(self):
        for viewport in VIEWPORTS:
            for scheme in self.schemes():
                with self.subTest(scheme=scheme, viewport=viewport), \
                        self.open(scheme, viewport):
                    self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                    self.to_week()
                    self.search('Toff States', phone=viewport == 'phone')
                    self.settle(1500)
                    self.check_count('M64', "document.querySelectorAll('.o_tl_pill').length",
                                     scheme, viewport, 'pills of Toff States')


# ------------------------------------------------------------------------------------------------
# the attendance world


@tagged('post_install', '-at_install')
class TestTimeOffProbesAttendance(TimeOffProbeCase):
    """The demo-like world in the attendance management view: M56 to M59, and the notes on
    002d3: M68 to M74."""

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

    def attendance(self, scheme, viewport='desktop'):
        return self.open(scheme, viewport, action=ATTENDANCE)

    def test_m56_m59_week(self):
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.attendance(scheme):
                self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                self.to_week()
                self.mouse('mouseMoved', 1000, 123, buttons=0)
                self.settle(1000)
                self.check('M56', cell_of_day('Mitchell Admin', '2026-11-16'), scheme, 'desktop',
                           'Mitchell Admin\'s cell of Monday 16')
                self.check('M57', cell_of_day('Abigail Peterson', '2026-11-16'), scheme,
                           'desktop', 'Abigail Peterson\'s cell of Monday 16')
                self.check('M58', in_row('Mitchell Admin', LABEL), scheme, 'desktop',
                           'Mitchell Admin\'s label')
                self.check_text(in_row('Mitchell Admin', LABEL), '0h / 16h', 'Mitchell\'s label')
                self.check('M59', in_row('Anita Oliver', LABEL), scheme, 'desktop',
                           'Anita Oliver\'s label')
                self.check_text(in_row('Anita Oliver', LABEL), '0h / 32h', 'Anita\'s label')

    def test_m86_m88_phone_control_bar(self):
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.attendance(scheme, 'phone'):
                self.loaded("document.querySelectorAll('.o_tl_progress_label').length > 0")
                self.check('M86', "document.querySelector('.o_tl_controls')", scheme, 'phone',
                           'the control bar')
                self.check('M87', "document.querySelector('.o_tl_today')", scheme, 'phone',
                           'Today')
                self.check('M88', "document.querySelector('.o_tl_col_group')", scheme, 'phone',
                           'the period line')

    # -- M68 to M71: the first Escape of the creation dialog (A79) ---------------------------

    def test_m68_m71_first_escape(self):
        break_input = f"document.querySelector('{MODAL} [name=\"break_duration\"] input')"
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.attendance(scheme):
                self.loaded("document.querySelectorAll('.o_tl_row_label').length > 0")
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
                self.settle(2000)
                self.check_count('M68', "document.querySelectorAll('.modal').length", scheme,
                                 'desktop', 'dialogs after the first Escape')
                got = self.js(f"{break_input}.value")
                COMPARED.add(('M69', scheme, 'desktop'))
                with self.subTest(probe='M69', scheme=scheme):
                    self.assertEqual(
                        got, measured('M69')[scheme]['value'], 'the break field still holds')
                self.check_count(
                    'M70', f"[...document.querySelectorAll('{MODAL} input')]"
                           ".filter((e) => e === document.activeElement).length", scheme,
                    'desktop', 'inputs that hold the focus')
                self.assertTrue(self.js(f"{break_input} === document.activeElement"))
                self.press_escape()
                self.settle(1500)
                self.check_count('M71', "document.querySelectorAll('.modal').length", scheme,
                                 'desktop', 'dialogs after the second Escape')

    # -- M72 to M74: a search that keeps no employee, on the phone (A80, ruling R-O10) ------------

    def test_m72_m74_helper_phone(self):
        """The helper, the period line and the empty row lie where the table has them (274.6, 274,
        324) on a phone page without touch emulation, as the table was taken; the A80 tour runs
        without it as well and pins the same values."""
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.attendance(scheme, 'phone'):
                self.loaded("document.querySelectorAll('.o_tl_row_label').length > 0")
                self.search('zzzz', phone=True)
                self.wait("!!document.querySelector('.o_hag_helper')")
                self.settle(1500)
                self.check('M72', "document.querySelector('.o_hag_helper')", scheme, 'phone',
                           'the helper')
                # The table's box (M73) is the period line's title: as wide as the grid's visible
                # part (260 px from x 129), over a line of 24 hour columns of 40 px, none folded.
                # Complete's period line is that line itself (24 x 40 px = 960 px from x 130) with a
                # sticky label, so the visible part of the line is read: y and height as the
                # table's, width 260; the left edge lies at x 130, 1 px right of the table's 129
                # (logged).
                self.check('M73', "document.querySelector('.o_tl_col_group')", scheme, 'phone',
                           'the period line', skip=('geometry.x', 'geometry.width'))
                visible = self.js("""(() => {
                    const line = document.querySelector('.o_tl_col_group').getBoundingClientRect();
                    const head = document.querySelector('.o_tl_title_cell').getBoundingClientRect();
                    const left = Math.max(line.left, head.right);
                    const right = Math.min(line.right, window.innerWidth);
                    return {x: left, width: right - left,
                            columns: document.querySelectorAll('.o_tl_col[data-index]').length,
                            folded: document.querySelectorAll('.o_tl_col.o_tl_folded').length,
                            span: line.width};
                })()""")
                want = measured('M73', 'phone')[scheme]
                with self.subTest(probe='M73', scheme=scheme, element='the visible title box'):
                    self.assertAlmostEqual(
                        visible['width'], float(want['geometry.width']), delta=.5)
                    self.assertEqual((visible['columns'], visible['folded'], visible['span']),
                                     (24, 0, 960))
                _logger.warning('SHELL-DIFFERENCE|M73|%s|phone|geometry.x|Complete %s, table %s',
                                scheme, visible['x'], want['geometry.x'])
                self.check('M74', f"{ROW_EL}[0].querySelector('.o_tl_row_header')", scheme,
                           'phone', 'the empty row header')


@tagged('post_install', '-at_install')
class TestTimeOffProbesZCoverage(TimeOffProbeCase):
    """The last probe class: every (probe, scheme, viewport) of the table was compared."""

    def test_coverage(self):
        if not STARTED >= {
                'TestTimeOffProbesDemo', 'TestTimeOffProbesRoles', 'TestTimeOffProbesFlexible',
                'TestTimeOffProbesStates', 'TestTimeOffProbesAttendance'}:
            self.skipTest('not every probe class ran')
        # M65 to M67 are the texts decision D1 corrects: no value of the table is compared
        wanted = {
            (name, scheme, view) for name, scheme, view, _prop, _value in TIME_OFF_PROBES
            if name not in ('M65', 'M66', 'M67') and (scheme == 'light' or self.has_theme)}
        # the attendance management view's probes need the Attendances bridge
        if not self.env['ir.module.module'].sudo().search_count(
                [('name', '=', 'hr_attendance_gantt'), ('state', '=', 'installed')]):
            in_attendance_view = {
                f'M{number}' for number in (*range(51, 60), *range(68, 75), 86, 87, 88)}
            wanted = {key for key in wanted if key[0] not in in_attendance_view}
        _logger.info('PROBE-COVERAGE|%s compared|%s left out whole', len(COMPARED), len(SKIPPED))
        self.assertEqual(COMPARED, wanted - SKIPPED, 'the probes compared are the table\'s')
