# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probes of the tracks Gantt bridge (M1 to M26; M19 is the original's and asks nothing).

Run only these: ``--test-tags /website_event_track_gantt:TestTrackProbes``. The dark scheme needs
``web_enterprise``; without it the dark probes are skipped. The values are in
``track_probe_values``. The browser clock is Tuesday 11 June 2030 09:00 (UTC+3).

Elements read: M1, M2, M4, M25, M26 the pill ``.o_tl_pill``; M3 the title box of the row header
``.o_tl_row_name``; M5, M12 the popover ``.o_popover``; M6 its header ``.o_popover_header``; M7,
M10 the block of the lines inside ``.o_popover_body``; M8 the bold label, M9 the value; M11 the
button ``.o_tl_popover_button``; M13 the footer ``.modal-footer`` of the record dialog; M14 to M17
its buttons, M18 the bin icon; M20, M21 the buttons of the new track's dialog; M22 the box
``.modal-content`` of the confirmation, M23, M24 its buttons.
"""
import json
import logging

from odoo.addons.test_web_gantt.tests.timeline_probe import CLOCK_TEMPLATE, TimelineProbeCase
from odoo.tests import HttpCase, tagged

from .track_fixtures import make_event_users, make_gantt_summit
from .track_probe_values import measured

SCHEMES = ('light', 'dark')
EVENTS = 'event.action_event_view'
TRACKS_MENU = 'website_event_track.action_event_track'
CLOCK = CLOCK_TEMPLATE % '2030, 5, 11, 6, 0, 0'
_logger = logging.getLogger(__name__)


def text_of(selector, text):
    """An expression: the first element of the selector whose text holds ``text``."""
    return (f"[...document.querySelectorAll({json.dumps(selector)})]"
            f".find((e) => e.textContent.includes({json.dumps(text)}))")


@tagged('post_install', '-at_install')
class TestTrackProbes(TimelineProbeCase):

    @classmethod
    def setUpClass(cls):
        # the host records of the timeline probes are not wanted here
        HttpCase.setUpClass.__func__(cls)
        cls.has_theme = bool(cls.env['ir.module.module'].search_count(
            [('name', '=', 'web_enterprise'), ('state', '=', 'installed')]))
        admin = cls.env.ref('base.user_admin')
        admin.group_ids = [(4, cls.env.ref('event.group_event_manager').id)]
        make_event_users(cls.env)
        cls.summit = make_gantt_summit(cls.env)

    # -- helpers --------------------------------------------------------------------------------

    def schemes(self, probes):
        found = [scheme for scheme in SCHEMES
                 if any(scheme in measured(probe) for probe in probes)
                 and (scheme == 'light' or self.has_theme)]
        if not found:
            self.skipTest('the dark scheme needs web_enterprise, which is not installed')
        return found

    def open(self, action, scheme, viewport, query='', ready='.o_kanban_view .o_kanban_record'):
        return self.page(action, scheme, viewport, query=query, clock=CLOCK, ready=ready)

    def check(self, probe, element_js, scheme, viewport, label, skip=()):
        expected = {prop: value for prop, value in measured(probe).get(scheme, {}).items()
                    if prop not in skip}
        self.assertTrue(expected, f'no value of {probe} in {scheme}')
        self.probe(probe, element_js, scheme, viewport, expected, label)

    def tap(self, element_js):
        """Click what an expression finds, once it exists."""
        try:
            self.wait(f"!!({element_js})", timeout=15)
        except AssertionError:
            _logger.warning('DOM-DUMP %s', self.js(
                "(document.querySelector('.o_control_panel') || document.body).outerHTML"
                ".slice(0, 6000)"))
            raise
        self.click_js(element_js)

    def open_tracks(self, phone=False):
        """The event from the Events Kanban, its Tracks button (in the button-box menu on the
        phone), the Gantt view (in the view switcher menu on the phone): A53's path."""
        self.tap(text_of('.o_kanban_record', 'Gantt Summit'))
        self.wait("!!document.querySelector('.o_form_view .o-form-buttonbox')", timeout=60)
        if phone:
            self.tap("document.querySelector('.o_form_view .o_button_more')")
            self.tap(text_of('.o-form-buttonbox-small .oe_stat_button', 'Tracks'))
        else:
            self.tap(text_of('.o_form_view .oe_stat_button', 'Tracks'))
        self.wait("!!document.querySelector('.o_cp_switch_buttons, .o_switch_view')", timeout=60)
        self.show_gantt(phone)

    def show_gantt(self, phone=False):
        if phone:
            self.tap("document.querySelector('.o_cp_switch_buttons .dropdown-toggle')")
            self.tap(text_of('.o_bottom_sheet_body button', 'Gantt'))
        else:
            self.tap("document.querySelector('.o_switch_view.o_gantt')")
        self.wait("document.querySelectorAll('.o_tl_pill').length > 0", timeout=60)
        self.settle()

    def open_popover(self, name):
        self.click_js(self.pill(name))
        self.wait("!!document.querySelector('.o_popover .o_tl_popover')")
        self.settle()

    def close_popover(self):
        self.click_js("document.querySelector('.o_card_popover_close')")
        self.wait("!document.querySelector('.o_popover')")

    def real_click(self, element_js):
        """A press and a release of the real mouse at the middle of the element (a click by
        script would leave the focus ring of a keyboard user on the button that takes focus)."""
        box = self.geometry(element_js)
        x = box['geometry.x'] + box['geometry.width'] / 2
        y = box['geometry.y'] + box['geometry.height'] / 2
        for kind, buttons in (('mouseMoved', 0), ('mousePressed', 1), ('mouseReleased', 0)):
            self.browser._websocket_request('Input.dispatchMouseEvent', params={
                'type': kind, 'x': x, 'y': y, 'button': 'left', 'buttons': buttons,
                'clickCount': 1})
        self.settle()

    def box_values(self, probe, scheme):
        return {name: float(value) for name, value in measured(probe)[scheme].items()
                if name.startswith('geometry.')}

    def check_frame(self, probe, scheme, viewport):
        """The popover's frame (``.o_popover``) is the frame of 002a's measure (M43): 272 px wide
        on a desktop screen, where this package's box is 274 x 210.688 (ruling T10-1, question
        Q-T2-1). What is held is the centre, the bottom edge, the height and everything but the
        position and the width; the frame is transparent (the content draws the background, M43),
        so the background is read on the content. Both boxes are logged."""
        want = self.box_values(probe, scheme)
        box = self.geometry("document.querySelector('.o_popover')")
        _logger.info('%s %s popover frame %s, package %s', probe, scheme, box, want)
        expected = measured(probe)[scheme]
        self.check(probe, "document.querySelector('.o_popover')", scheme, viewport,
                   'the popover box', skip=('background-color', 'geometry.x', 'geometry.y',
                                            'geometry.width', 'geometry.height'))
        self.probe(probe, "document.querySelector('.o_tl_popover')", scheme, viewport,
                   {'background-color': expected['background-color']}, 'the popover content')
        self.assertAlmostEqual(
            box['geometry.x'] + box['geometry.width'] / 2,
            want['geometry.x'] + want['geometry.width'] / 2, delta=.6, msg=f'{probe} centre')
        self.assertAlmostEqual(
            box['geometry.y'] + box['geometry.height'],
            want['geometry.y'] + want['geometry.height'], delta=.6, msg=f'{probe} bottom edge')
        self.assertAlmostEqual(box['geometry.height'], want['geometry.height'], delta=.6,
                               msg=f'{probe} height')

    def check_in_frame(self, probe, element_js, scheme, label):
        """A part of the popover: everything as measured, but x and width, which follow the frame
        (T10-1): the part lies as far from the frame's left edge, and is as much narrower than the
        measured width as the frame is narrower than the measured box (2 px)."""
        want = self.box_values(probe, scheme)
        frame = self.box_values('M5', scheme)
        box = self.geometry("document.querySelector('.o_popover')")
        shift = box['geometry.x'] - frame['geometry.x']
        narrower = frame['geometry.width'] - box['geometry.width']
        names = ('geometry.x', 'geometry.width')
        self.check(probe, element_js, scheme, 'desktop', label,
                   skip=[n for n in names if n in want])
        part = self.geometry(element_js)
        if 'geometry.x' in want:
            self.assertAlmostEqual(part['geometry.x'], want['geometry.x'] + shift, delta=.6,
                                   msg=f'{probe} x')
        if 'geometry.width' in want:
            self.assertAlmostEqual(part['geometry.width'], want['geometry.width'] - narrower,
                                   delta=.6, msg=f'{probe} width')

    def check_sheet(self, scheme):
        """The sheet (``.o_popover``) is 388 x 698 px at (1, 146) in Complete, 002a's measure
        (M43), where this package's box is 390 x 700 at (0, 144) with a top margin of 144 (ruling
        T10-1, question Q-T2-1): what is held is the bottom edge, the centre, the colours, the
        border and the rounded top corners; both boxes are logged."""
        want = self.box_values('M12', scheme)
        box = self.geometry("document.querySelector('.o_popover')")
        _logger.info('M12 %s sheet %s, package %s', scheme, box, want)
        self.check('M12', "document.querySelector('.o_popover')", scheme, 'phone',
                   'the popover sheet', skip=('margin-top', 'geometry.x', 'geometry.y',
                                              'geometry.width', 'geometry.height'))
        self.assertAlmostEqual(box['geometry.x'] + box['geometry.width'] / 2,
                               want['geometry.x'] + want['geometry.width'] / 2, delta=.6)
        self.assertAlmostEqual(box['geometry.y'] + box['geometry.height'],
                               want['geometry.y'] + want['geometry.height'], delta=.6)
        # 002a M43: the size of Complete's frame
        self.assertAlmostEqual(box['geometry.width'], 388, delta=.6, msg='M12 width')
        self.assertAlmostEqual(box['geometry.height'], 698, delta=.6, msg='M12 height')

    def check_in_june(self, probe, scheme, viewport):
        """Question Q-T10-1: the measured pill lies 4 px right of this package's (x 905 against
        901 on a desktop, 232 against 228 on the phone): the focus of the year range lies 4 px
        further right there. What is held is the pill inside the June column and every
        other value as measured; both x are logged."""
        june = self.geometry("[...document.querySelectorAll('.o_tl_col')]"
                             ".find((c) => c.dataset.date === '2030-06-01')")
        pill = self.geometry(self.pill('Panel Talk'))
        _logger.info('%s pill x %s, June column x %s, measured x %s', probe,
                     pill['geometry.x'], june['geometry.x'], measured(probe)[scheme]['geometry.x'])
        self.assertAlmostEqual(pill['geometry.x'], june['geometry.x'] + 1, delta=.6)
        self.check(probe, self.pill('Panel Talk'), scheme, viewport, 'Panel Talk, June',
                   skip=('geometry.x',))

    # -- M1 to M3: pills and a row header -------------------------------------------------------

    def test_m01_m03_pills_and_row_header(self):
        for scheme in self.schemes(['M1', 'M2', 'M3']):
            with self.open(EVENTS, scheme, 'desktop'):
                self.open_tracks()
                self.check('M1', self.pill('Wood Joinery'), scheme, 'desktop', 'Wood Joinery')
                self.check('M2', self.pill('Panel Talk'), scheme, 'desktop', 'Panel Talk')
                self.check('M3', f"{self.row('Theatre')}.querySelector('.o_tl_row_name')",
                           scheme, 'desktop', 'the row header Theatre')

    # -- M5 to M11: the popover -----------------------------------------------------------------

    def test_m05_m11_popover(self):
        probes = ['M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11']
        popover = "document.querySelector('.o_popover')"
        for scheme in self.schemes(probes):
            with self.open(EVENTS, scheme, 'desktop'):
                self.open_tracks()
                self.open_popover('Wood Joinery')
                self.check_frame('M5', scheme, 'desktop')
                header = f"{popover}.querySelector('.o_popover_header')"
                self.check_in_frame('M6', header, scheme, 'the header')
                block = f"{popover}.querySelector('.o_track_popover_lines')"
                self.check('M7', block, scheme, 'desktop', 'the block of the lines')
                label = f"{block}.querySelector('strong')"
                self.check('M8', label, scheme, 'desktop', 'the label Start')
                value = f"{block}.querySelector('div').lastElementChild"
                self.check('M9', value, scheme, 'desktop', 'the value of Start')
                self.check('M11', f"{popover}.querySelector('.o_tl_popover_button')", scheme,
                           'desktop', 'the Edit button')
                self.close_popover()
                self.open_popover('Panel Talk')
                self.check('M10', f"{popover}.querySelector('.o_track_popover_lines')", scheme,
                           'desktop', 'the block of the one line')

    # -- M13 to M18, M22 to M24: the record dialog and the confirmation -------------------------

    def test_m13_m18_m22_m24_dialog(self):
        probes = ['M13', 'M14', 'M15', 'M16', 'M17', 'M18', 'M22', 'M23', 'M24']
        for scheme in self.schemes(probes):
            with self.open(EVENTS, scheme, 'desktop'):
                self.open_tracks()
                self.open_popover('Panel Talk')
                self.tap("document.querySelector('.o_tl_popover_button')")
                self.wait("!!document.querySelector('.o_dialog .o_track_delete')", timeout=30)
                self.settle()
                dialog = "document.querySelector('.o_dialog')"
                self.check('M13', f"{dialog}.querySelector('.modal-footer')", scheme, 'desktop',
                           'the footer')
                for probe, selector in (('M14', '.o_form_button_save'),
                                        ('M15', '.o_form_button_cancel'),
                                        ('M16', '.o_track_unschedule'),
                                        ('M17', '.o_track_delete'),
                                        ('M18', '.o_track_delete i')):
                    self.check(probe, f"{dialog}.querySelector({json.dumps(selector)})", scheme,
                               'desktop', selector)
                self.real_click(f"{dialog}.querySelector('.o_track_delete')")
                self.wait("document.querySelectorAll('.o_dialog').length === 2", timeout=30)
                self.settle()
                top = "document.querySelectorAll('.o_dialog')[1]"
                self.check('M22', f"{top}.querySelector('.modal-content')", scheme, 'desktop',
                           'the confirmation box')
                self.check('M23', f"{top}.querySelector('.modal-footer .btn-primary')", scheme,
                           'desktop', 'Delete')
                self.check('M24', f"{top}.querySelector('.modal-footer .btn-secondary')", scheme,
                           'desktop', 'Discard')

    # -- M20, M21: the new track's dialog -------------------------------------------------------

    def test_m20_m21_new_dialog(self):
        for scheme in self.schemes(['M20', 'M21']):
            with self.open(EVENTS, scheme, 'desktop'):
                self.open_tracks()
                self.tap("document.querySelector('.o_tl_button_add')")
                self.wait("!!document.querySelector('.o_dialog .o_form_button_save')", timeout=30)
                self.settle()
                dialog = "document.querySelector('.o_dialog')"
                self.check('M20', f"{dialog}.querySelector('.o_form_button_save')", scheme,
                           'desktop', 'Save of the new track')
                last = ("[...document.querySelectorAll('.o_dialog .modal-footer button')]"
                        ".filter((b) => b.getBoundingClientRect().width > 0).at(-1)")
                self.check('M21', last, scheme, 'desktop', 'Discard of the new track')

    # -- M25, M26: the menu, year range ---------------------------------------------------------

    def test_m25_year_range(self):
        for scheme in self.schemes(['M25']):
            with self.open(TRACKS_MENU, scheme, 'desktop', query='?debug=1&view_type=gantt',
                           ready='.o_tl_renderer .o_tl_row'):
                self.wait("document.querySelectorAll('.o_tl_pill').length > 0", timeout=60)
                self.settle()
                self.check_in_june('M25', scheme, 'desktop')

    def test_m26_year_range_phone(self):
        for scheme in self.schemes(['M26']):
            with self.open(TRACKS_MENU, scheme, 'phone', query='?debug=1'):
                self.show_gantt(phone=True)
                self.check_in_june('M26', scheme, 'phone')

    # -- M4, M12: the phone (A53) ---------------------------------------------------------------

    def test_m04_m12_phone(self):
        for scheme in self.schemes(['M4', 'M12']):
            with self.open(EVENTS, scheme, 'phone'):
                self.open_tracks(phone=True)
                self.check('M4', self.pill('Opening Keynote'), scheme, 'phone', 'Opening Keynote')
                self.open_popover('Opening Keynote')
                self.check_sheet(scheme)
