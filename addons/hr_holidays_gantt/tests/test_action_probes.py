# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of the measured values of slice 002e2 (spec.md, "Measured values", M1 to M80): the leave
popover, the split tool, the pointer and the handles, the record dialog, the moves and the
notifications in a real headless Chrome, compared with the table of the original by machine
(``action_probe_values``).

Run only these: ``--test-tags /hr_holidays_gantt:TestActionProbesDemo,/hr_holidays_gantt:
TestActionProbesAct,/hr_holidays_gantt:TestActionProbesRoles,/hr_holidays_gantt:
TestActionProbesSplit,/hr_holidays_gantt:TestActionProbesMove,/hr_holidays_gantt:
TestActionProbesZCoverage``. The dark scheme needs ``web_enterprise``; without it only the light
probes run. The browser clock is Wednesday 11 November 2026, 10:00:05 UTC (11:00 in Brussels) and
runs on; the window is 1600 x 900 (phone 390 x 844, touch).

Worlds, because their rows cannot share one page:

* *demo*: the 22 demo employees with Anita Oliver's leave of Wednesday 18 ("Trip"): M1 to M21 on
  the desktop, and on the phone the sheet's values of R21 point 3 and the counts M12 and M21;
* *act*: "Toff Act" (acceptance "act"): M24 to M43, M66 to M69 (A12, A16, A17, A13, A23);
* *roles*: Toff Role Emp in Management > Time Off (M44 to M48) and in the report view (M49 to
  M55), with the request's sheet on the phone;
* *split*: "Toff Act" Approved from Monday 16 to Wednesday 18 (M56 to M62, M64, M65, M77, M78);
* *move*: "Toff Act" To Approve on Monday 16 and Approved on Wednesday 18 (M72 to M74, M76).

Left out of the comparison and why, the rulings of Task 11:

* R-T11-1: M22 and M23 (the short phone window) are the original's places of a popover the phone
  does not open (R21, decision D5); the phone is compared with R21 point 3's values;
* R-T11-2: M75 (an error dialog after the move of an Approved request) holds the original's
  reading; Complete's pill is locked (D7): the probe asserts no dialog;
* R-T11-3: M80 (two handles on the Approved pill) is the original's; Complete shows none (D7);
* R-T11-4: M77 and M78 are read by meaning, one notification that offers Undo, M65 the same for
  the undo's result (the texts are Complete's own words);
* R-T11-5: the dashed line's own width (M58 geometry.width) plays no part, as its Where cell says;
* R-T11-6: the automatic left margin of the footer's last button (M33, M40, M47) is the room the
  buttons leave; the original's buttons are a few 1/64 px wider or narrower, so it is compared
  within 0.05 px (the other styles within 0.01);
* R-T11-7: M49 to M55 read the request of Wednesday 18 (the table's day), not Thursday 19 of
  acceptance A31, so that the popover lies where the table has it; M46, M47 and M49 to M54 are not
  among the values the shell moves (their y is the table's);
* R-T11-8: M11's focus ring is a 3 px outline of no style (the table's value): the link shows its
  focus by an underline.

The desktop y values of M1, M2 to M21, M24 to M43, M56 to M60 and M66 to M69 are compared 3 px
lower (``SHELL``), logged as ``SHELL-DIFFERENCE``; M62 is not moved.
"""
import json
import logging
import time
from datetime import date

from odoo.addons.test_web_gantt.tests.timeline_probe import compare_value
from odoo.tests import tagged

from . import test_probes as base
from . import time_off_fixtures as fx
from .action_probe_values import TIME_OFF_ACTION_PROBES, measured

_logger = logging.getLogger(__name__)

SHELL = base.SHELL
KNOWN = {row[0] for row in TIME_OFF_ACTION_PROBES}
COMPARED = set()
SKIPPED = set()
STARTED = set()
CLASSES = {
    'TestActionProbesDemo', 'TestActionProbesAct', 'TestActionProbesRoles',
    'TestActionProbesSplit', 'TestActionProbesMove',
}

POP = "document.querySelector('.o_hhg_pop')"
FRAME = f"{POP}.closest('.o_popover')"
FOOTER = "document.querySelector('.o_hhg_pop_footer')"
DEMO_NAME = 'Anita Oliver'
ACT = fx.ACT_NAME
WEEK_DAYS = {16: '2026-11-16', 17: '2026-11-17', 18: '2026-11-18', 19: '2026-11-19',
             20: '2026-11-20'}


def pop(selector):
    return f"{POP}.querySelector({json.dumps(selector)})"


def button(name):
    return f"document.querySelector('.o_hhg_pop_footer button[name=\"{name}\"]')"


def count_of(selector):
    return f"document.querySelectorAll({selector!r}).length"


def outer(pill_js):
    """A hidden box laid over the pill's outer box, its 1 px inset included (the "[box: ...]" of
    M1, M24 and M56): the element the geometry is read on."""
    return f"""(() => {{
        const r = ({pill_js}).getBoundingClientRect();
        let box = document.getElementById('hhg_probe_outer');
        if (!box) {{
            box = document.body.appendChild(document.createElement('div'));
            box.id = 'hhg_probe_outer';
        }}
        Object.assign(box.style, {{position: 'fixed', pointerEvents: 'none', visibility: 'hidden',
            left: (r.x - 1) + 'px', top: (r.y - 1) + 'px', width: (r.width + 2) + 'px',
            height: (r.height + 2) + 'px'}});
        return box;
    }})()"""


def pill_on(name, day):
    """The pill of the row ``name`` that starts at the column of the day ``day`` (a date text)."""
    column = base.column_js(day)
    return (f"{base.pills_of(name)}.find((p) => "
            f"Math.abs(p.getBoundingClientRect().x - {column}.getBoundingClientRect().x) < 6)")


def by_text(scope, selector, text):
    """The innermost element of ``scope`` matching ``selector`` whose text reads ``text``."""
    return (f"[...{scope}.querySelectorAll({selector!r})].filter((e) => "
            f"e.textContent.replace(/\\s+/g, ' ').trim() === {text!r}).pop()")


class ActionProbeCase(base.TimeOffProbeCase):
    """The probes' own table, counts and cursors; the page and the real input are 002e's."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        STARTED.add(cls.__name__)

    @classmethod
    def isolate(cls, keep=()):
        """002e's isolation, then the one company of the table's database: the administrator's
        companies are the main one, which has a country, so the Community names no country after
        a type (``Legal leave employee``, not ``... (Generic)``)."""
        super().isolate(keep)
        company = cls.env.ref('base.main_company')
        company.country_id = cls.env.ref('base.us')
        cls.admin.write({'company_ids': [(6, 0, company.ids)], 'company_id': company.id})
        cls.env.flush_all()

    # -- the checks ---------------------------------------------------------------------------

    def check(self, probe, element_js, scheme, viewport, label, skip=(), override=None, dy=0,
              loose=()):
        """The element against the rows of ``probe``; ``dy`` is the shell's known difference
        (``SHELL-DIFFERENCE``): Complete lies ``dy`` pixels higher than the table's y."""
        self.assertIn(probe, KNOWN, f'{probe} is not a probe of the table')
        expected = {prop: value for prop, value in measured(probe, viewport).get(scheme, {}).items()
                    if prop not in skip}
        self.assertTrue(expected, f'no value of {probe} in {scheme}/{viewport}')
        if dy and 'geometry.y' in expected:
            expected['geometry.y'] = str(float(expected['geometry.y']) - dy)
            _logger.warning('SHELL-DIFFERENCE|%s|%s|%s|geometry.y|%s px lower in the original',
                            probe, scheme, viewport, dy)
        left = [prop for prop in skip if prop in measured(probe, viewport).get(scheme, {})]
        if left:
            _logger.warning('SHELL-DIFFERENCE|%s|%s|%s|left out|%s|%s', probe, scheme, viewport,
                            ','.join(left), label)
        expected.update(override or {})
        COMPARED.add((probe, scheme, viewport))
        # R-T11-6: an automatic margin is the room the buttons leave; the original's buttons are a
        # few 1/64 px wider or narrower than Complete's (the text's layout), so it is compared
        # within 0.05 px, not 0.01
        for prop in [prop for prop in expected if prop in loose]:
            want = float(expected.pop(prop))
            got = self.read(element_js, [prop])
            with self.subTest(probe=probe, scheme=scheme, viewport=viewport, prop=prop):
                self.assertAlmostEqual(
                    float(got[prop].removesuffix('px')), want, delta=.05, msg=f'{probe} {prop}')
        # a list of shadows is compared as text (the framework reads a leading ``rgb`` as a colour)
        for prop in [prop for prop in expected if prop == 'text-shadow']:
            want = expected.pop(prop)
            got = self.read(element_js, [prop])
            with self.subTest(probe=probe, scheme=scheme, viewport=viewport, prop=prop):
                self.assertEqual(got and got[prop], want, f'{probe} {scheme} {prop}')
        self.probe(probe, element_js, scheme, viewport, expected, label)
        # the half pixel the comparison allows must not hide a residue
        edges = [prop for prop in expected if prop.startswith('geometry.')]
        found = self.read(element_js, edges) if edges else None
        for prop in edges if found else ():
            residue = float(found[prop]) - float(expected[prop])
            if abs(residue) > .05:
                _logger.warning('PROBE-RESIDUE|%s|%s|%s|%s|%.3f px|%s', probe, scheme, viewport,
                                prop, residue, label)

    def check_count(self, probe, count_js, scheme, viewport, label, want=None):
        self.assertIn(probe, KNOWN, f'{probe} is not a probe of the table')
        rows = measured(probe, viewport).get(scheme)
        self.assertTrue(rows, f'no value of {probe} in {scheme}/{viewport}')
        want = int(rows['count']) if want is None else want
        got = self.js(count_js)
        COMPARED.add((probe, scheme, viewport))
        with self.subTest(probe=probe, scheme=scheme, viewport=viewport, element=label):
            if got != want:
                _logger.warning('PROBE-MISMATCH|%s|%s|%s|count|%s|%s|%s', probe, scheme, viewport,
                                want, got, label)
            self.assertEqual(got, want, f'{probe} {scheme}/{viewport} {label}')

    def by_meaning(self, probe, count_js, scheme, label, want=1):
        """A probe read by meaning (R-T11-4): the table's count is Complete's too, the texts are
        not compared."""
        self.assertIn(probe, KNOWN)
        self.check_count(probe, count_js, scheme, 'desktop', label, want=want)

    def check_values(self, probe, element_js, scheme, label, expected):
        """R21 point 3's values, which the table has no row for: ``{prop: value}`` read on the
        sheet's element."""
        self.probe(probe, element_js, scheme, 'phone', expected, label)

    # -- states ---------------------------------------------------------------------------------

    def week(self, scheme, viewport='desktop', who=None, login='admin', touch=False, **kwargs):
        """The Overview on the Week range of 15 to 21 November, searched for ``who``."""
        page = self.open(scheme, viewport, login=login, touch=touch or viewport == 'phone',
                         **kwargs)
        return page

    def prepare(self, who=None, viewport='desktop'):
        self.loaded("document.querySelectorAll('.o_tl_pill').length > 0")
        self.to_week()
        if who:
            self.search(who, phone=viewport == 'phone')
        self.mouse('mouseMoved', 1000, 123, buttons=0)
        self.settle(900)

    def click_pill(self, pill_js, viewport='desktop', wait=".o_hhg_pop"):
        self.js(f"({pill_js}).scrollIntoView({{block: 'nearest', inline: 'nearest'}})")
        self.settle(300)
        if viewport == 'phone':
            self.finger_tap(pill_js)
        else:
            self.real_click(pill_js, settle=0.4)
        self.wait(f"!!document.querySelector({wait!r})", timeout=30)
        self.settle(1200)

    def close_popover(self):
        self.press_escape()
        self.wait("!document.querySelector('.o_hhg_pop')", timeout=15)
        self.settle(500)

    def type_description(self, text='Dentist'):
        area = pop('.o_hhg_pop_note textarea')
        self.real_click(area, settle=0.3)
        self.browser._websocket_request('Input.insertText', params={'text': text})
        self.settle(300)
        # the field is left: a click on the title
        self.real_click(pop('.o_hhg_pop_title'), settle=1.0)

    def drag(self, pill_js, dx, steps=6):
        """A press at the pill's centre, 30 px of moving, then ``dx`` further, and the release."""
        x, y = self.centre(pill_js)
        self.mouse('mouseMoved', x, y, buttons=0)
        self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
        for step in range(1, steps + 1):
            self.mouse('mouseMoved', x + 30 + (dx - 30) * step / steps, y, buttons=1)
            time.sleep(0.05)
        self.mouse('mouseReleased', x + dx, y, button='left', buttons=0, clickCount=1)
        self.settle(1800)

    def pointer_on(self, pill_js, settle=900):
        x, y = self.centre(pill_js)
        self.mouse('mouseMoved', x - 5, y, buttons=0)
        self.mouse('mouseMoved', x, y, buttons=0)
        self.settle(settle)
        return x, y

    # -- the popover's probes, shared ------------------------------------------------------------

    def approved_popover_probes(self, scheme, dy):
        """M2 to M21 on the Approved request's popover (desktop)."""
        def check(probe, element_js, label):
            return self.check(probe, element_js, scheme, 'desktop', label, dy=dy)

        check('M2', FRAME, 'the frame')
        check('M3', POP, 'the surface')
        check('M4', pop('.o_hhg_pop_header'), 'the header')
        check('M5', pop('.o_hhg_pop_title'), 'the title')
        self.check_text(pop('.o_hhg_pop_title'), 'Anita Oliver - 1 day', 'the title')
        check('M6', pop('.o_hhg_pop_expand'), 'the expand icon')
        check('M7', pop('.o_hhg_pop_close'), 'the close icon')
        check('M8', pop('.o_hhg_pop_content'), 'the body')
        check('M9', pop('.o_hhg_pop_type .o_hhg_pop_icon'), 'the tag')
        check('M10', pop(".o_hhg_pop_type [class*='o_calendar_color_']"), 'the code badge')
        check('M11', pop('.o_hhg_pop_type a'), 'the type name')
        self.check_count(
            'M12', "[...document.querySelectorAll('.o_hhg_pop_type a')]"
                   ".filter((e) => e === document.activeElement).length",
            scheme, 'desktop', 'the focused type link')
        check('M13', pop('.o_hhg_pop_dates .o_hhg_pop_icon'), 'the clock')
        check('M14', pop('.o_hhg_pop_choice .o_field_widget'), 'the duration, read-only')
        check('M15', pop('.o_hhg_pop_days .o_field_widget'), 'the number of days')
        check('M16', pop('.o_hhg_pop_note .o_hhg_pop_icon'), 'the pencil')
        check('M17', pop('.o_hhg_pop_note .o_field_widget'), 'the description')
        self.check_text(pop('.o_hhg_pop_note .o_field_widget'), 'Trip', 'the description')
        check('M18', FOOTER, 'the footer')
        check('M19', button('edit'), 'Edit')
        check('M20', button('delete'), 'Delete')
        self.check_count('M21', count_of('.o_hhg_pop_footer button'), scheme, 'desktop',
                         'the footer\'s buttons')


# ------------------------------------------------------------------------------------------------
# the demo world


@tagged('post_install', '-at_install')
class TestActionProbesDemo(ActionProbeCase):
    """The 22 demo employees; Anita Oliver's leave of Wednesday 18 reads "Trip": M1 to M21."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.build_demo_world()
        leave = cls.env['hr.leave'].with_context(active_test=False).sudo().search([
            ('employee_id', '=', cls.world[DEMO_NAME].id),
            ('request_date_from', '=', date(2026, 11, 18))])
        assert len(leave) == 1, leave
        leave.with_context(leave_skip_state_check=True).write({'name': 'Trip'})
        cls.env.flush_all()

    def test_a10_popover_of_an_approved_request(self):
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.week(scheme):
                self.prepare()
                pill = base.pill_js(DEMO_NAME, 'PTO 1d')
                self.check('M1', outer(pill), scheme, 'desktop', 'the pill "PTO 1d"',
                           dy=SHELL['desktop'])
                self.click_pill(pill)
                self.approved_popover_probes(scheme, SHELL['desktop'])

    def test_a10_sheet_on_the_phone(self):
        """R21 point 3's values on the sheet of the read-only request, and the counts M12, M21."""
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.week(scheme, 'phone'):
                self.prepare(viewport='phone')
                self.click_pill(base.pill_js(DEMO_NAME, 'PTO 1d'), 'phone', '.o_hhg_pop_sheet')
                self.check_count(
                    'M12', "[...document.querySelectorAll('.o_hhg_pop_type a')]"
                           ".filter((e) => e === document.activeElement).length",
                    scheme, 'phone', 'the focused type link')
                self.check_count('M21', count_of('.o_hhg_pop_footer button'), scheme, 'phone',
                                 'the footer\'s buttons')
                header = pop('.o_hhg_pop_header')
                self.check_values('R21', header, scheme, 'the header', {
                    'geometry.height': '28.2', 'padding-left': '16'})
                self.check_values('R21', pop('.o_hhg_pop_title'), scheme, 'the title',
                                  {'font-size': '16'})
                self.check_values(
                    'R21', pop(".o_hhg_pop_type [class*='o_calendar_color_']"), scheme,
                    'the badge', {'geometry.width': '36.1', 'geometry.height': '23'})
                self.check_values('R21', FOOTER, scheme, 'the footer', {
                    'geometry.height': '53', 'padding-left': '16', 'padding-right': '16',
                    'padding-bottom': '16'})
                for name, width in (('edit', '68.1'), ('delete', '84.5')):
                    self.check_values('R21', button(name), scheme, name, {
                        'geometry.height': '37', 'font-size': '14', 'geometry.width': width})


# ------------------------------------------------------------------------------------------------
# the act world


@tagged('post_install', '-at_install')
class TestActionProbesAct(ActionProbeCase):
    """"Toff Act": STO To Approve on Wednesday 18, UN at Second Approval on Thursday 19, STO
    Approved on Friday 20: M24 to M43, M66 to M71."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        fx.make_act_state(cls.env, cls.schedule)
        cls.isolate(keep={ACT})

    def day_pill(self, day):
        return pill_on(ACT, WEEK_DAYS[day])

    def test_r26_striped_pill_under_the_pointer(self):
        """M84 and M85: the request To Approve of Wednesday 18, the pointer away, then at its
        centre: the stripes stay and darken, the colour does not change."""
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.week(scheme):
                self.prepare(ACT)
                wed = self.day_pill(18)
                self.check('M84', wed, scheme, 'desktop', 'the pill To Approve at rest')
                self.pointer_on(wed)
                self.check('M85', wed, scheme, 'desktop', 'the pill To Approve under the pointer')

    def test_a16_a13_a17_popovers(self):
        dy = SHELL['desktop']
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.week(scheme):
                self.prepare(ACT)
                wed = self.day_pill(18)
                self.check('M24', outer(wed), scheme, 'desktop', 'the pill To Approve', dy=dy)
                self.click_pill(wed)
                self.check('M25', FRAME, scheme, 'desktop', 'the frame', dy=dy)
                self.check('M26', pop('.o_hhg_pop_type input'), scheme, 'desktop',
                           'the type input', dy=dy)
                self.check_count(
                    'M27', "[...document.querySelectorAll('.o_hhg_pop_type input')]"
                           ".filter((e) => e === document.activeElement).length",
                    scheme, 'desktop', 'the focused type input')
                choice = pop('.o_hhg_pop_choice')
                self.check('M28', by_text(choice, 'button, .btn, .o_selection_badge', 'Full Day'),
                           scheme, 'desktop', 'Full Day', dy=dy)
                self.check('M29', by_text(choice, 'button, .btn, .o_selection_badge', 'Morning'),
                           scheme, 'desktop', 'Morning', dy=dy)
                self.check('M30', pop('.o_hhg_pop_note textarea'), scheme, 'desktop',
                           'the description', dy=dy)
                self.check('M31', button('approve'), scheme, 'desktop', 'Approve', dy=dy)
                self.check('M32', button('refuse'), scheme, 'desktop', 'Refuse', dy=dy)
                self.check('M33', button('delete'), scheme, 'desktop', 'Delete', dy=dy,
                           loose=('margin-left',))
                self.check_count('M34', count_of('.o_hhg_pop_footer button'), scheme, 'desktop',
                                 'the footer\'s buttons')
                # A13: a description typed and the field left
                self.type_description()
                self.check('M40', button('discard'), scheme, 'desktop', 'Discard', dy=dy,
                           loose=('margin-left',))
                self.check_count('M41', count_of('.o_hhg_pop_footer button[name="delete"]'),
                                 scheme, 'desktop', 'Delete buttons')
                self.check_count('M42', count_of('.o_hhg_pop_footer button[name="save"]'),
                                 scheme, 'desktop', 'Save buttons')
                self.check_count('M43', count_of('.o_hhg_pop_footer button'), scheme, 'desktop',
                                 'the footer\'s buttons')
                self.close_popover()
                # A17: Second Approval, then Approved
                self.click_pill(self.day_pill(19))
                self.check_count('M35', count_of('.o_hhg_pop_footer button[name="edit"]'), scheme,
                                 'desktop', 'Edit buttons')
                self.check_count('M36', count_of('.o_hhg_pop_footer button[name="approve"]'),
                                 scheme, 'desktop', 'Approve buttons')
                self.check_count('M37', count_of('.o_hhg_pop_footer button'), scheme, 'desktop',
                                 'the footer\'s buttons')
                self.close_popover()
                self.click_pill(self.day_pill(20))
                self.check_count('M38', count_of('.o_hhg_pop_footer button'), scheme, 'desktop',
                                 'the footer\'s buttons')
                self.check_count('M39', count_of('.o_hhg_pop_footer button[name="edit"]'), scheme,
                                 'desktop', 'Edit buttons')

    def test_a16_sheet_on_the_phone(self):
        """R21 point 3's values on the sheet of the request To Approve, and M27, M34."""
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.week(scheme, 'phone'):
                self.prepare(ACT, 'phone')
                self.click_pill(self.day_pill(18), 'phone', '.o_hhg_pop_sheet')
                self.check_count(
                    'M27', "[...document.querySelectorAll('.o_hhg_pop_type input')]"
                           ".filter((e) => e === document.activeElement).length",
                    scheme, 'phone', 'the focused type input')
                self.check_count('M34', count_of('.o_hhg_pop_footer button'), scheme, 'phone',
                                 'the footer\'s buttons')
                for name, width in (('approve', '96.2'), ('refuse', '88.4'), ('delete', '84.5')):
                    self.check_values('R21', button(name), scheme, name, {
                        'geometry.height': '37', 'font-size': '14', 'geometry.width': width})
                choice = pop('.o_hhg_pop_choice')
                for text, width in (('Full Day', '81.4'), ('Morning', '80.6')):
                    self.check_values(
                        'R21', by_text(choice, 'button, .btn, .o_selection_badge', text), scheme,
                        text, {'geometry.height': '37', 'geometry.width': width})
                self.check_values('R21', pop('.o_hhg_pop_note .o_field_widget'), scheme,
                                  'the description', {'geometry.height': '50'})

    def test_a23_pointer_and_handles(self):
        dy = SHELL['desktop']
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.week(scheme):
                self.prepare(ACT)
                wed = self.day_pill(18)
                x, y = self.pointer_on(wed)
                self.check('M66', f"document.elementFromPoint({x}, {y})", scheme, 'desktop',
                           'the pointer over the pill To Approve', dy=dy)
                handles = f"{wed}.querySelectorAll('.o_tl_handle')"
                self.check('M67', f"{handles}[0]", scheme, 'desktop', 'the start handle', dy=dy)
                self.check('M68', f"{handles}[1]", scheme, 'desktop', 'the end handle', dy=dy)
                fri = self.day_pill(20)
                x, y = self.pointer_on(fri)
                self.check('M69', f"document.elementFromPoint({x}, {y})", scheme, 'desktop',
                           'the pointer over the Approved pill', dy=dy)
                # R-T11-3: the original shows two handles (M80), Complete none (D7)
                self.by_meaning_count('M80', f"{fri}.querySelectorAll('.o_tl_handle').length",
                                      scheme, 'the handles of the Approved pill')

    def by_meaning_count(self, probe, count_js, scheme, label):
        """A reading the original made and decision D7 corrects: Complete shows none; the probe
        asserts that, no value of the table is compared (``action_probe_values``)."""
        COMPARED.add((probe, scheme, 'desktop'))
        with self.subTest(probe=probe, scheme=scheme, element=label):
            self.assertEqual(self.js(count_js), 0, f'{probe} {label}: none on Complete (D7)')

    def test_a12_double_click_opens_the_dialog(self):
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.week(scheme):
                self.prepare(ACT)
                x, y = self.centre(self.day_pill(18))
                self.mouse('mouseMoved', x, y, buttons=0)
                self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
                self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
                time.sleep(0.06)
                self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=2)
                self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=2)
                self.wait("!!document.querySelector('.modal .o_form_view')", timeout=30)
                self.settle(1500)
                self.check_count('M70', count_of('.modal'), scheme, 'desktop',
                                 'record dialogs')
                self.check_count('M71', count_of('.o_hhg_pop'), scheme, 'desktop', 'popovers')


# ------------------------------------------------------------------------------------------------
# the roles world


@tagged('post_install', '-at_install')
class TestActionProbesRoles(ActionProbeCase):
    """Toff Role Emp: his request To Approve in Management > Time Off's Gantt (M44 to M48); his
    Approved request in the report view (M49 to M55)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        fx.make_role_users(cls.env, cls.schedule)
        cls.isolate(keep={'Toff Role Emp', 'Toff Peer', 'Toff Role None', 'Toff Role Approver',
                          'Toff Role Manager', 'Toff Role Officer', 'Toff Role Admin'})

    def emp(self):
        return self.env['hr.employee'].search([('name', '=', 'Toff Role Emp')], limit=1)

    def test_a14_a15_own_request(self):
        fx.make_waiting(self.env, self.emp(), fx.find_type(self.env, 'STO'), date(2026, 11, 18))
        self.env.flush_all()
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), \
                    self.open(scheme, action=base.MANAGEMENT, login='toff_emp',
                              ready='.o_list_view'):
                self.settle(500)
                self.js("document.querySelector('.o_cp_switch_buttons .o_switch_view.o_gantt')"
                        ".click()")
                self.wait("!!document.querySelector('.o_tl_renderer .o_tl_row_header')",
                          timeout=30)
                self.loaded("!!document.querySelector('.o_tl_renderer .o_tl_row_header')")
                self.to_week()
                self.mouse('mouseMoved', 1000, 123, buttons=0)
                self.settle(900)
                self.click_pill(pill_on('Toff Role Emp', '2026-11-18'))
                self.check_count('M44', count_of('.o_hhg_pop_footer button'), scheme, 'desktop',
                                 'the footer\'s buttons')
                self.check_count('M45', count_of('.o_hhg_pop_type input'), scheme, 'desktop',
                                 'type inputs')
                self.type_description()
                self.check('M46', button('save'), scheme, 'desktop', 'Save')
                self.check('M47', button('discard'), scheme, 'desktop', 'Discard',
                           loose=('margin-left',))
                self.check_count('M48', count_of('.o_hhg_pop_footer button'), scheme, 'desktop',
                                 'the footer\'s buttons')

    def report_popover(self, scheme, viewport):
        return self.open(scheme, viewport, login='toff_emp', touch=viewport == 'phone')

    def approved_request(self):
        """Toff Role Emp's Approved request of Wednesday 18 (M49 asks for that day, A31 for 19)."""
        fx.make_leave(self.env, self.emp(), fx.find_type(self.env, 'STO'), date(2026, 11, 18))
        self.env.flush_all()

    def test_a31_report_popover(self):
        self.approved_request()
        # M49 to M54 are not among the probes the shell moves (their y is the table's)
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.report_popover(scheme, 'desktop'):
                self.prepare('Toff Role Emp')
                self.click_pill(f"{base.pills_of('Toff Role Emp')}[0]")
                self.check('M49', FRAME, scheme, 'desktop', 'the frame')
                self.check('M50', pop('.o_field_many2one_avatar_employee'), scheme, 'desktop',
                           'the employee')
                self.check('M51', pop('.o_field_badge .badge'), scheme, 'desktop',
                           'the status badge')
                self.check('M52', pop('.o_field_daterange'), scheme, 'desktop', 'the dates')
                self.check('M53', pop('.o_field_char'), scheme, 'desktop', 'the duration')
                self.check('M54', button('delete'), scheme, 'desktop', 'Delete')
                self.check_count('M55', count_of('.o_hhg_pop_footer button'), scheme, 'desktop',
                                 'the footer\'s buttons')

    def test_a31_report_sheet_on_the_phone(self):
        self.approved_request()
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.report_popover(scheme, 'phone'):
                self.prepare('Toff Role Emp', 'phone')
                self.click_pill(f"{base.pills_of('Toff Role Emp')}[0]", 'phone',
                                '.o_hhg_pop_sheet')
                self.check_count('M55', count_of('.o_hhg_pop_footer button'), scheme, 'phone',
                                 'the footer\'s buttons')
                self.check_values('R21', button('delete'), scheme, 'Delete', {
                    'geometry.height': '37', 'font-size': '14', 'geometry.width': '84.5'})


# ------------------------------------------------------------------------------------------------
# the split world


@tagged('post_install', '-at_install')
class TestActionProbesSplit(ActionProbeCase):
    """"Toff Act" Approved from Monday 16 to Wednesday 18: M56 to M62, M64, M65, M77, M78."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.leave = fx.make_split_state(cls.env, cls.schedule)
        cls.isolate(keep={ACT})

    def test_a40_a41_a42_split_and_undo(self):
        dy = SHELL['desktop']
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.week(scheme):
                self.prepare(ACT)
                pill = f"{base.pills_of(ACT)}[0]"
                self.check('M56', outer(pill), scheme, 'desktop', 'the pill', dy=dy)
                border = self.geometry(base.column_js('2026-11-17'))['geometry.x']
                box = self.geometry(pill)
                y = box['geometry.y'] + box['geometry.height'] / 2
                self.mouse('mouseMoved', border + 40, y, buttons=0)
                self.mouse('mouseMoved', border + 2, y, buttons=0)
                self.wait("!!document.querySelector('.o_hhg_split_tool')", timeout=15)
                self.settle(700)
                tool = "document.querySelector('.o_hhg_split_tool')"
                self.check('M57', tool, scheme, 'desktop', 'the split tool', dy=dy)
                self.check('M58', f"{tool}.querySelector('.o_hhg_split_line')", scheme, 'desktop',
                           'the dashed line', dy=dy, skip=('geometry.width',))
                self.check('M59', f"{tool}.querySelector('.o_hhg_split_scissors')", scheme,
                           'desktop', 'the scissors', dy=dy)
                self.check('M60', f"document.elementFromPoint({border + 2}, {y})", scheme,
                           'desktop', 'the pointer over the pill', dy=dy)
                self.line_as_drawn(scheme, tool)
                self.mouse('mousePressed', border + 2, y, button='left', buttons=1, clickCount=1)
                self.mouse('mouseReleased', border + 2, y, button='left', buttons=0, clickCount=1)
                self.wait("!!document.querySelector('.o_notification')", timeout=30)
                self.settle(1500)
                self.check_count('M61', f"{base.pills_of(ACT)}.length", scheme, 'desktop',
                                 'pills of the row')
                self.check('M62', "document.querySelector('.o_notification')", scheme, 'desktop',
                           'the notification of the split')
                undo = "[...document.querySelectorAll('.o_notification button')]"
                self.by_meaning('M77', count_of('.o_notification'), scheme,
                                'notifications of the split')
                self.by_meaning('M78', f"{undo}.filter((b) => b.textContent.trim() === "
                                       "'Undo').length", scheme, 'Undo buttons')
                self.js(f"{undo}.find((b) => b.textContent.trim() === 'Undo').click()")
                self.wait(f"{base.pills_of(ACT)}.length === 1", timeout=30)
                self.settle(1500)
                self.check_count('M64', f"{base.pills_of(ACT)}.length", scheme, 'desktop',
                                 'pills after Undo')
                self.by_meaning('M65', count_of('.o_notification'), scheme,
                                'notifications after Undo')

    def line_as_drawn(self, scheme, tool):
        """M58 as a user sees it: the line's opacity and its colour over the pill, black at 60 %
        on the pill's yellow (about ``rgb(96, 86, 48)`` / ``rgb(95, 83, 41)``)."""
        drawn = self.js(f"""(() => {{
            const line = {tool}.querySelector('.o_hhg_split_line');
            const pill = document.querySelectorAll('.o_tl_pill')[0];
            const [r, g, b] = getComputedStyle(pill).backgroundColor.match(/[\\d.]+/g).map(Number);
            const opacity = Number(getComputedStyle(line).opacity);
            return [r, g, b].map((c) => Math.round(c * (1 - opacity)));
        }})()""")
        want = {'light': (96, 86, 48), 'dark': (95, 83, 41)}[scheme]
        with self.subTest(probe='M58', scheme=scheme, element='the line over the pill'):
            for got, expected in zip(drawn, want, strict=True):
                self.assertAlmostEqual(got, expected, delta=3, msg=f'{drawn} instead of {want}')
        self.assertIsNone(compare_value('opacity', '0.6', self.js(
            f"getComputedStyle({tool}.querySelector('.o_hhg_split_line')).opacity")))


# ------------------------------------------------------------------------------------------------
# the move world


@tagged('post_install', '-at_install')
class TestActionProbesMove(ActionProbeCase):
    """"Toff Act" To Approve on Monday 16 and Approved on Wednesday 18: M72 to M74, M76."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        fx.make_move_state(cls.env, cls.schedule)
        cls.isolate(keep={ACT})

    def starting_on(self, day):
        column = base.column_js(day)
        return (f"{base.pills_of(ACT)}.filter((p) => Math.abs(p.getBoundingClientRect().x - "
                f"{column}.getBoundingClientRect().x) < 6).length")

    def test_a24_a25_move_undo_and_locked(self):
        for scheme in self.schemes():
            with self.subTest(scheme=scheme), self.week(scheme):
                self.prepare(ACT)
                width = self.geometry(base.column_js('2026-11-16'))['geometry.width']
                self.drag(pill_on(ACT, '2026-11-16'), width)
                self.wait("!!document.querySelector('.o_notification')", timeout=30)
                self.settle(1000)
                undo = ("[...document.querySelectorAll('.o_notification button')]"
                        ".filter((b) => b.textContent.trim() === 'Undo')")
                self.check_count('M72', f"{undo}.length", scheme, 'desktop',
                                 'notifications with Undo')
                self.check_count('M73', self.starting_on('2026-11-17'), scheme, 'desktop',
                                 'pills on Tuesday 17')
                self.js(f"{undo}[0].click()")
                self.wait(self.starting_on('2026-11-16') + ' === 1', timeout=30)
                self.settle(1500)
                self.check_count('M74', self.starting_on('2026-11-16'), scheme, 'desktop',
                                 'pills on Monday 16 after Undo')
                # A25: the Approved pill is locked (D7); the request stays where it is
                self.drag(pill_on(ACT, '2026-11-18'), width)
                self.check_count('M76', self.starting_on('2026-11-18'), scheme, 'desktop',
                                 'pills still on Wednesday 18')
                # R-T11-2: the original shows an error dialog (M75), Complete none
                COMPARED.add(('M75', scheme, 'desktop'))
                with self.subTest(probe='M75', scheme=scheme):
                    self.assertEqual(self.js(count_of('.modal')), 0, 'no error dialog (D7)')


@tagged('post_install', '-at_install')
class TestActionProbesZCoverage(ActionProbeCase):
    """The last class: every compared probe of the table was compared, none else was."""

    def test_coverage(self):
        if not STARTED >= CLASSES:
            self.skipTest('not every probe class ran')
        wanted = {
            (name, scheme, view) for name, scheme, view, _prop, _value in TIME_OFF_ACTION_PROBES
            if scheme == 'light' or self.has_theme}
        # the original's readings that decision D7 corrects are asserted as none (R-T11-2, 3)
        asserted = {(name, scheme, 'desktop') for name in ('M75', 'M80')
                    for scheme in ('light', 'dark') if scheme == 'light' or self.has_theme}
        _logger.info('PROBE-COVERAGE|%s compared|%s left out whole', len(COMPARED), len(SKIPPED))
        self.assertEqual(COMPARED - asserted, wanted - SKIPPED,
                         'the probes compared are the table\'s')
        self.assertEqual(asserted - COMPARED, set(), 'the corrected readings were asserted')

