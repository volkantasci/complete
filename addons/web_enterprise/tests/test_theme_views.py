# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probe tests of the standard views: control panel, search bar, kanban, search panel
(001b R15, R23-R25, R32, R33, R38 colour picker and company switcher field, R42)."""
import colorsys
import math
import re

from odoo import fields
from odoo.tests import tagged

from .test_theme_shell import SECTION_TOGGLE, ShellProbeCase
from .theme_fixtures import KANBAN, LIST, MARK, _action

PAGE = {'light': '#F8F9FA', 'dark': '#1F1F23'}
VIEW = {'light': '#FFFFFF', 'dark': '#2C2E35'}
BORDER = {'light': '#DEE2E6', 'dark': '#3E3F47'}
GREY_400 = {'light': '#CED4DA', 'dark': '#56575E'}
SCHEMES = ('light', 'dark')

CARD = '.o_kanban_record'
HEADER = '.o_kanban_group .o_kanban_header'
# the dark base colours of the record palette (spec "Record colour palette")
DARK_BASE = [
    '#E58585', '#FF4949', '#FF9C41', '#E1B000', '#5EA6FF', '#F040EC',
    '#FF9467', '#00CEBE', '#405EFF', '#FF4BA0', '#00DC67', '#A67AFF',
]
LIGHT_BASE_4 = '#5794DD'


def px(value):
    return float(value[:-2])


def hex_rgb(value):
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


def swatch(base):
    """The dark colour picker swatch: the base colour darkened by 5, desaturated by 15."""
    hue, lightness, saturation = colorsys.rgb_to_hls(*(c / 255 for c in hex_rgb(base)))
    red, green, blue = colorsys.hls_to_rgb(
        hue, max(0, lightness - .05), max(0, saturation - .15))
    return '#' + ''.join(f'{round(c * 255):02X}' for c in (red, green, blue))


def mix(front, back, weight):
    """Sass ``mix($front, $back, weight)`` of two hex colours, as a hex colour."""
    return '#' + ''.join(
        f'{round(f * weight + b * (1 - weight)):02X}'
        for f, b in zip(hex_rgb(front), hex_rgb(back), strict=True))


@tagged('post_install', '-at_install')
class TestThemeViews(ShellProbeCase):
    # -- helpers --------------------------------------------------------------------

    def kanban_page(self, scheme, **kwargs):
        return self.page(self.app_url, scheme=scheme, **kwargs)

    def ungrouped_page(self, scheme, **kwargs):
        url = f"/odoo/action-{self.fixtures['kanban_ungrouped_action']}"
        return self.page(url, scheme=scheme, **kwargs)

    def ready(self, selector=CARD):
        self.wait(f"!!document.querySelector('{selector}')")
        # the start-up animations and transitions end
        self.js("new Promise((resolve) => setTimeout(resolve, 600))")

    def radii(self, selector, index=0):
        got = self.style(
            selector, 'border-top-left-radius', 'border-top-right-radius',
            'border-bottom-right-radius', 'border-bottom-left-radius', index=index)
        return tuple(got.values())

    # -- A32 control panel ----------------------------------------------------------

    def test_A32_control_panel(self):
        for scheme in SCHEMES:
            with self.kanban_page(scheme):
                self.ready()
                got = self.style(
                    '.o_control_panel', 'border-bottom-width', 'padding-bottom',
                    'padding-top', 'background-color')
                self.assertEqual(got['border-bottom-width'], '0px', scheme)
                self.assertEqual(got['padding-bottom'], '16px', scheme)
                self.assertEqual(got['padding-top'], '8px', scheme)
                self.assertColour(got['background-color'], PAGE[scheme])

    def test_A32_actions_fill_height(self):
        with self.kanban_page('light'):
            self.ready()
            main = self.rect('.o_control_panel_main')
            actions = self.rect('.o_control_panel_actions')
            self.assertAlmostEqual(actions['height'], main['height'], delta=.5)
            self.assertAlmostEqual(actions['y'], main['y'], delta=.5)
            navigation = self.style('.o_control_panel_navigation', 'align-items')
            self.assertEqual(navigation['align-items'], 'center')

    # -- A85 search bar and facet ---------------------------------------------------

    def _bar_state(self, scheme):
        view = VIEW[scheme]
        rest = {'light': '#CED4DA', 'dark': BORDER[scheme]}[scheme]
        focus = {'light': '#68A9AF', 'dark': '#398A88'}[scheme]
        bar = '.o_cp_searchview .o_searchview'
        with self.kanban_page(scheme):
            self.ready()
            self.js("document.activeElement && document.activeElement.blur()")
            self.js("new Promise((resolve) => setTimeout(resolve, 400))")
            got = self.style(bar, 'height', 'background-color', 'border-top-color',
                             'border-top-width', 'border-top-left-radius',
                             'border-bottom-left-radius', 'border-top-right-radius')
            self.assertAlmostEqual(px(got['height']), 37, delta=.5)
            self.assertGreaterEqual(px(got['border-top-left-radius']), 18.5)  # a pill end
            self.assertGreaterEqual(px(got['border-bottom-left-radius']), 18.5)
            self.assertEqual(got['border-top-right-radius'], '0px')  # the toggle closes it
            self.assertEqual(got['border-top-width'], '1px')
            self.assertColour(got['background-color'], view)
            self.assertColour(got['border-top-color'], rest)
            # focused: the border changes, the background does not
            self.js("document.querySelector('.o_searchview_input').focus()")
            self.js("new Promise((resolve) => setTimeout(resolve, 400))")
            got = self.style(bar, 'background-color', 'border-top-color', 'box-shadow')
            self.assertColour(got['border-top-color'], focus)
            self.assertColour(got['background-color'], view)
            self.assertEqual(got['box-shadow'], 'none')

    def test_A85_search_bar_light(self):
        self._bar_state('light')

    def test_A85_search_bar_dark(self):
        self._bar_state('dark')

    def _facet(self, scheme):
        label_bg, label_text = {
            'light': ('#E3DBE1', '#714B67'), 'dark': ('#662E58', '#C175AD'),
        }[scheme]
        with self.kanban_page(scheme):
            self.ready()
            self.js("""(() => {
                const input = document.querySelector('.o_searchview_input');
                input.focus();
                input.value = 'cws';
                input.dispatchEvent(new Event('input', {bubbles: true}));
            })()""")
            self.wait("!!document.querySelector('.o_searchview_autocomplete .o-dropdown-item')")
            self.key('Enter')
            self.wait("!!document.querySelector('.o_searchview_facet')")
            self.js("new Promise((resolve) => setTimeout(resolve, 500))")
            facet = self.style('.o_searchview_facet', 'background-color', 'border-top-left-radius')
            self.assertColour(facet['background-color'], PAGE[scheme])
            self.assertEqual(facet['border-top-left-radius'], '6px')
            label = self.style('.o_searchview_facet_label', 'background-color', 'color')
            self.assertColour(label['background-color'], label_bg)
            self.assertColour(label['color'], label_text)

    def test_A85_facet_light(self):
        self._facet('light')

    def test_A85_facet_dark(self):
        self._facet('dark')

    # -- A53 / A54 / A55 / A56 cards ------------------------------------------------

    def _grouped(self, scheme):
        with self.kanban_page(scheme):
            self.ready()
            # a column of four cards: first, middle, last
            self.assertEqual(self.radii(CARD, 0), ('8px', '8px', '0px', '0px'))
            self.assertEqual(self.radii(CARD, 1), ('0px',) * 4)
            self.assertEqual(self.radii(CARD, 2), ('0px',) * 4)
            self.assertEqual(self.radii(CARD, 3), ('0px', '0px', '8px', '8px'))
            first, second = self.rect(CARD, 0), self.rect(CARD, 1)
            self.assertAlmostEqual(second['y'], first['y'] + first['height'] - 1, delta=.5)
            self.assertAlmostEqual(first['x'], second['x'], delta=.5)
            got = self.style(CARD, 'padding-top', 'padding-bottom', 'padding-left',
                             'padding-right', 'font-size', 'background-color',
                             'border-top-color', 'border-top-width')
            self.assertEqual(
                (got['padding-top'], got['padding-bottom']), ('10px', '10px'))
            self.assertEqual(
                (got['padding-left'], got['padding-right']), ('14px', '14px'))
            self.assertEqual(got['font-size'], '13px')
            self.assertEqual(got['border-top-width'], '1px')
            self.assertColour(got['background-color'], VIEW[scheme])
            self.assertColour(got['border-top-color'], BORDER[scheme])
            # the kanban itself is transparent: the page shows through
            renderer = self.style('.o_kanban_renderer', 'background-color')
            self.assertColour(renderer['background-color'], '#000000', alpha=0)

    def test_A53_grouped_cards_light(self):
        self._grouped('light')

    def test_A53_grouped_cards_dark(self):
        self._grouped('dark')

    def test_A53b_single_card_column(self):
        # the invoice column holds one card: it is first and last at once
        with self.kanban_page('light'):
            self.ready()
            self.assertEqual(self.radii(CARD, 4), ('8px',) * 4)
            self.assertEqual(self.radii(CARD, 5), ('8px', '8px', '0px', '0px'))
            self.assertEqual(self.radii(CARD, 6), ('0px', '0px', '8px', '8px'))

    def test_A54_ungrouped_cards_desktop(self):
        with self.ungrouped_page('light'):
            self.ready()
            for index in range(7):
                self.assertEqual(self.radii(CARD, index), ('8px',) * 4, index)
            first, second = self.rect(CARD, 0), self.rect(CARD, 1)
            self.assertAlmostEqual(first['y'], second['y'], delta=.5)
            self.assertAlmostEqual(second['x'] - first['x'] - first['width'], 16, delta=.5)
            # first card of the second row sits one gap below the first row
            wrapped = self.js(
                f"""(() => {{
                    const cards = [...document.querySelectorAll('{CARD}')];
                    const top = cards[0].getBoundingClientRect();
                    const next = cards.find((c) => c.getBoundingClientRect().y > top.y + 1);
                    if (!next) {{ return null; }}
                    const box = next.getBoundingClientRect();
                    return box.y - top.y - top.height;
                }})()""")
            if wrapped is not None:
                self.assertAlmostEqual(wrapped, 16, delta=.5)
            pad = self.style('.o_kanban_renderer', 'padding-top', 'padding-left',
                             'padding-right', 'padding-bottom')
            self.assertEqual(
                tuple(pad.values()), ('0px', '16px', '16px', '16px'), pad)

    def test_A54_ungrouped_cards_mobile(self):
        with self.ungrouped_page('light', size=(390, 844), touch=True):
            self.ready()
            for index in range(3):
                self.assertEqual(self.radii(CARD, index), ('0px',) * 4, index)
            renderer = self.rect('.o_kanban_renderer')
            first, second = self.rect(CARD, 0), self.rect(CARD, 1)
            self.assertAlmostEqual(first['width'], renderer['width'], delta=1)
            self.assertAlmostEqual(first['x'], renderer['x'], delta=1)
            self.assertAlmostEqual(second['y'] - first['y'] - first['height'], 2, delta=.5)

    def _hover(self, scheme):
        with self.kanban_page(scheme):
            self.ready()
            rest = self.style(CARD, 'z-index', index=0)['z-index']
            with self.forced(CARD, 'hover', index=1):
                got = self.style(CARD, 'border-top-color', 'z-index', index=1)
            self.assertColour(got['border-top-color'], GREY_400[scheme])
            above = int(got['z-index']) if got['z-index'] != 'auto' else 0
            neighbour = int(rest) if rest != 'auto' else 0
            self.assertGreater(above, neighbour)

    def test_A55_card_hover_light(self):
        self._hover('light')

    def test_A55_card_hover_dark(self):
        self._hover('dark')

    def _strip(self, scheme):
        base = {'light': LIGHT_BASE_4, 'dark': DARK_BASE[4]}[scheme]
        with self.kanban_page(scheme):
            self.ready()
            strip = '.o_kanban_record.o_kanban_color_4'
            got = self.style(strip, 'background-color', 'width', 'left', 'position',
                             'border-top-width', 'border-top-left-radius',
                             'border-bottom-left-radius', pseudo='::after')
            self.assertColour(got['background-color'], base)
            self.assertEqual((got['width'], got['left'], got['position']),
                             ('3px', '0px', 'absolute'))
            self.assertEqual(got['border-top-width'], '0px')
            # it follows the card's left corner radii: the last contact ends its column
            card = self.radii(strip)
            self.assertEqual(card, ('0px', '0px', '8px', '8px'))
            self.assertEqual(got['border-top-left-radius'], '0px')
            self.assertEqual(got['border-bottom-left-radius'], '7px')
            # a card without a colour has no strip
            none = self.js("""(() => {
                const card = [...document.querySelectorAll('.o_kanban_record')]
                    .find((c) => c.textContent.includes('invoice 1'));
                const after = getComputedStyle(card, '::after');
                return [after.backgroundColor, after.content, after.borderLeftWidth,
                        after.borderRightWidth];
            })()""")
            self.assertEqual(none[0], 'rgba(0, 0, 0, 0)')
            self.assertEqual((none[2], none[3]), ('0px', '0px'))

    def test_A56_colour_strip_light(self):
        self._strip('light')

    def test_A56_colour_strip_dark(self):
        self._strip('dark')

    # -- A58 column header, A59 progress bar, A60 totals ---------------------------

    def _column_header(self, scheme):
        view, border = VIEW[scheme], {'light': '#CED4DA', 'dark': BORDER[scheme]}[scheme]
        text = {'light': '#212529', 'dark': '#EBEBEB'}[scheme]
        hover = {'light': '#E7EBED', 'dark': '#3E3F47'}[scheme]
        with self.kanban_page(scheme):
            self.ready()
            got = self.style(HEADER, 'font-size', 'row-gap', 'padding-bottom',
                             'padding-left', 'padding-right', 'margin-left', 'margin-right',
                             'display', 'flex-direction')
            self.assertEqual(got['font-size'], '16.8px')
            self.assertEqual(got['row-gap'], '4px')
            self.assertEqual(got['padding-bottom'], '8px')
            self.assertEqual((got['padding-left'], got['padding-right']), ('16px', '16px'))
            self.assertEqual((got['margin-left'], got['margin-right']), ('-16px', '-16px'))
            self.assertEqual((got['display'], got['flex-direction']), ('flex', 'column'))
            title = self.style('.o_column_title', 'font-size', 'font-weight')
            self.assertEqual((title['font-size'], title['font-weight']), ('16.8px', '500'))
            # the title row is centred around its tallest item
            title_box, add_box = self.rect('.o_column_title'), self.rect('.o_kanban_quick_add')
            self.assertAlmostEqual(
                title_box['y'] + title_box['height'] / 2,
                add_box['y'] + add_box['height'] / 2, delta=1)
            # quick add and column settings buttons: the secondary look
            for button in ('.o_kanban_header .o_kanban_quick_add',
                           '.o_kanban_header .o_btn_circle.dropdown-toggle'):
                # the circle button paints its fill and border on its ::before
                got = self.style(button, 'background-color', 'border-top-color',
                                 'border-top-width', pseudo='::before')
                self.assertColour(got['background-color'], view)
                self.assertColour(got['border-top-color'], border)
                self.assertEqual(got['border-top-width'], '1px')
                self.assertColour(self.style(button, 'color')['color'], text)
            with self.forced('.o_kanban_header .o_kanban_quick_add', 'hover'):
                got = self.style('.o_kanban_header .o_kanban_quick_add',
                                 'background-color', pseudo='::before')
            self.assertColour(got['background-color'], hover)

    def test_A58_column_header_light(self):
        self._column_header('light')

    def test_A58_column_header_dark(self):
        self._column_header('dark')

    def _progress(self, scheme):
        grey = GREY_400[scheme]
        with self.kanban_page(scheme):
            self.ready()
            bar = '.o_kanban_counter .o_column_progress'
            got = self.style(bar, 'height', 'border-top-left-radius', 'background-color')
            self.assertAlmostEqual(px(got['height']), 12.8, delta=.05)
            self.assertEqual(got['border-top-left-radius'], '4px')
            self.assertColour(got['background-color'], grey)
            segment = self.style(f'{bar} .progress-bar.bg-success', 'background-image')
            self.assertIn('linear-gradient', segment['background-image'])
            plain = self.style(f'{bar} .progress-bar.bg-300', 'background-color')
            self.assertColour(plain['background-color'], grey)

    def test_A59_progress_bar_light(self):
        self._progress('light')

    def test_A59_progress_bar_dark(self):
        self._progress('dark')

    def test_A60_A42_column_total_weight(self):
        with self.kanban_page('light'):
            self.ready()
            for selector in ('.o_kanban_counter .o_animated_number',
                             '.o_kanban_counter .o_animated_number b'):
                self.assertEqual(self.style(selector, 'font-weight')['font-weight'], '500')

    # -- A61 frosted sticky header --------------------------------------------------

    def _frosted(self, scheme):
        red, green, blue = {'light': (248, 249, 250), 'dark': (31, 31, 35)}[scheme]
        # a short window, so the column scrolls
        with self.kanban_page(scheme, size=(1400, 380)):
            self.ready()
            self.js("""(() => {
                const header = document.querySelector('.o_kanban_group .o_kanban_header');
                let node = header.parentElement;
                while (node && !['auto', 'scroll'].includes(getComputedStyle(node).overflowY)) {
                    node = node.parentElement;
                }
                node.scrollTop = 80;
            })()""")
            self.wait("!!document.querySelector('.o_kanban_header.o_cws_stuck')")
            self.js("new Promise((resolve) => setTimeout(resolve, 500))")
            got = self.style(
                '.o_kanban_header.o_cws_stuck', 'backdrop-filter', 'background-image',
                'mask-image', 'z-index', pseudo='::before')
            self.assertEqual(got['backdrop-filter'], 'blur(4px)')
            self.assertEqual(got['z-index'], '-1')
            image = got['background-image']
            self.assertIn(f'rgb({red}, {green}, {blue}) 0%', image)
            self.assertIn(f'rgba({red}, {green}, {blue}, 0.75) 80%', image)
            self.assertRegex(image, r'rgba\(0, 0, 0, 0\) 100%')
            self.assertTrue(re.search(r'0\.75\) 80%', got['mask-image']), got['mask-image'])

    def test_A61_frosted_header_light(self):
        self._frosted('light')

    def test_A61_frosted_header_dark(self):
        self._frosted('dark')

    # -- A84 search panel -----------------------------------------------------------

    def _panel(self, scheme):
        active_bg = {'light': '#E6F2F3', 'dark': '#3E3F47'}[scheme]
        active_text = {'light': '#000000', 'dark': '#FFFFFF'}[scheme]
        inactive = {'light': '#343A40', 'dark': '#D1D1D3'}[scheme]
        header = '.o_search_panel_category_value_header'
        with self.page(self.fixtures['apps_kanban_url'], scheme=scheme):
            self.ready(f'{header}.active')
            got = self.style(f'{header}.active', 'background-color', 'font-weight',
                             'border-top-left-radius', 'border-bottom-right-radius', 'color')
            self.assertColour(got['background-color'], active_bg)
            self.assertEqual(got['font-weight'], '500')
            self.assertEqual(
                (got['border-top-left-radius'], got['border-bottom-right-radius']),
                ('6px', '6px'))
            self.assertColour(got['color'], active_text)
            got = self.style(f'{header}:not(.active)', 'color', 'background-color')
            self.assertColour(got['color'], inactive)
            self.assertColour(got['background-color'], '#000000', alpha=0)
            # the toggle button sits directly under the control panel
            self.assertEqual(
                self.style('.o_search_panel_wrap', 'padding-top')['padding-top'], '0px')
            # the kanban beside the panel: no left padding, 8 px card radii
            self.assertEqual(
                self.style('.o_kanban_renderer', 'padding-left')['padding-left'], '0px')
            self.assertEqual(self.radii(CARD), ('8px',) * 4)

    def test_A84_search_panel_light(self):
        self._panel('light')

    def test_A84_search_panel_dark(self):
        self._panel('dark')

    def _bottom_sheet(self, scheme):
        active_bg = {'light': '#E6F2F3', 'dark': '#56575E'}[scheme]
        header = '.o_bottom_sheet .o_search_panel_category_value_header.active'
        with self.page(self.fixtures['apps_kanban_url'], scheme=scheme,
                       size=(390, 844), touch=True):
            self.ready()
            self.js("document.querySelector('.o_search_panel .btn.btn-secondary').click()")
            self.wait(f"!!document.querySelector('{header}')")
            self.js("new Promise((resolve) => setTimeout(resolve, 500))")
            got = self.style(header, 'background-color', 'font-weight')
            self.assertColour(got['background-color'], active_bg)
            self.assertEqual(got['font-weight'], '500')

    def test_A84_bottom_sheet_light(self):
        self._bottom_sheet('light')

    def test_A84_bottom_sheet_dark(self):
        self._bottom_sheet('dark')

    # -- R24 highlights (dark values are normative) --------------------------------

    def test_R24_column_highlights(self):
        with self.kanban_page('dark'):
            self.ready()
            got = self.style('.o_kanban_renderer', '--KanbanColumn__highlight-background',
                             '--KanbanColumn__highlight-border',
                             '--KanbanColumn__highlight-selected')
            self.assertColour(got['--KanbanColumn__highlight-background'], '#1F3738')
            self.assertColour(got['--KanbanColumn__highlight-border'], '#1CBCB1')
            self.assertColour(got['--KanbanColumn__highlight-selected'], '#20364B')

    # -- A93 colour picker and company switcher field ------------------------------

    def _open_card_menu(self):
        self.js("document.querySelector('.o_kanban_record .o_dropdown_kanban button').click()")
        self.wait("!!document.querySelector('.o_kanban_colorpicker .o_colorlist_item_color_4')")
        self.js("new Promise((resolve) => setTimeout(resolve, 300))")

    def test_A93_dark_colour_picker(self):
        with self.kanban_page('dark'):
            self.ready()
            self._open_card_menu()
            for index in range(1, 12):
                selector = f'.o_kanban_colorpicker .o_colorlist_item_color_{index}'
                got = self.style(selector, 'background-color')
                self.assertColour(got['background-color'], swatch(DARK_BASE[index]))

    def test_A93_light_colour_picker(self):
        with self.kanban_page('light'):
            self.ready()
            self._open_card_menu()
            got = self.style('.o_kanban_colorpicker .o_colorlist_item_color_4',
                             'background-color')
            self.assertColour(got['background-color'], LIGHT_BASE_4)

    def test_A93_swatch_text_dark(self):
        with self.kanban_page('dark'):
            self.ready()
            self._open_card_menu()
            for index in (1, 4, 10):
                selector = f'.o_kanban_colorpicker .o_colorlist_item_color_{index}'
                got = self.style(selector, 'color')
                self.assertColour(
                    got['color'], mix(swatch(DARK_BASE[index]), VIEW['dark'], .15))

    def test_A93_company_switcher_field(self):
        company = self.env['res.company'].create({'name': 'Cws probe company'})
        admin = self.env['res.users'].search([('login', '=', 'admin')], limit=1)
        admin.company_ids = [(4, company.id)]
        field = '.o_switch_company_menu_dropdown .form-control[role="search"]'
        with self.kanban_page('dark'):
            self.ready()
            self.wait("!!document.querySelector('.o_switch_company_menu:not([disabled])')")
            self.js("document.querySelector('.o_switch_company_menu').click()")
            self.wait(f"!!document.querySelector('{field}')")
            self.js("new Promise((resolve) => setTimeout(resolve, 300))")
            got = self.style(field, 'border-top-color')
            self.assertColour(got['border-top-color'], '#56575E')

    # -- A8 typography --------------------------------------------------------------

    def test_A8_typography(self):
        with self.page(self.fixtures['form_record_url'], scheme='light'):
            self.wait("!!document.querySelector('.o_form_view h1')")
            got = self.style('.o_form_view h1', 'font-size', 'font-weight')
            self.assertEqual((got['font-size'], got['font-weight']), ('33.6px', '500'))
        with self.kanban_page('light'):
            self.wait_app()
            title = self.style('.o_column_title', 'font-size', 'font-weight')
            self.assertEqual((title['font-size'], title['font-weight']), ('16.8px', '500'))
            self.assertEqual(self.style(CARD, 'font-size')['font-size'], '13px')
            self.assertEqual(self.style(SECTION_TOGGLE, 'font-weight')['font-weight'], '400')


GREY_700 = {'light': '#495057', 'dark': '#B3B4B8'}
ACTION = {'light': '#017E84', 'dark': '#1CBCB1'}
HOVER_ALPHA = {'light': .055, 'dark': .10}
SELECTED = {'light': ('#D1ECF1', '#A7BDC1'), 'dark': ('#223446', '#4E5D6B')}
BLACK_ROLE = {'light': '#000000', 'dark': '#FFFFFF'}
COLOUR_RE = re.compile(r'rgba?\([^)]*\)')


def first_colour(value):
    """The first colour written in a computed ``box-shadow`` or image value."""
    match = COLOUR_RE.search(value)
    assert match, value
    return match.group(0)


@tagged('post_install', '-at_install')
class TestThemeListPivotGraph(ShellProbeCase):
    """Probe tests of list, pivot and graph (001b R26-R28)."""

    # -- list ---------------------------------------------------------------------

    def list_page(self, scheme, grouped=False, **kwargs):
        key = 'list_grouped_action' if grouped else 'list_action'
        return self.page(f"/odoo/action-{self.fixtures[key]}", scheme=scheme, **kwargs)

    def list_ready(self, selector='.o_data_row'):
        self.wait(f"!!document.querySelector('{selector}')")
        self.js("new Promise((resolve) => setTimeout(resolve, 600))")

    def _not_striped(self, scheme):
        with self.list_page(scheme):
            self.list_ready()
            for index in (0, 1):
                got = self.style('.o_data_row > td.o_data_cell', 'background-color', index=index)
                self.assertColour(got['background-color'], VIEW[scheme])
            got = self.style('.o_list_table thead th:not(.o_list_record_selector)',
                             'color', 'font-weight', 'padding-top', 'padding-bottom', index=0)
            self.assertColour(got['color'], GREY_700[scheme])
            self.assertEqual(got['font-weight'], '400')
            self.assertEqual((got['padding-top'], got['padding-bottom']), ('8px', '8px'))

    def test_A63_list_not_striped_light(self):
        self._not_striped('light')

    def test_A63_list_not_striped_dark(self):
        self._not_striped('dark')

    def _hover_selection(self, scheme):
        bg, line = SELECTED[scheme]
        with self.list_page(scheme):
            self.list_ready()
            cell = '.o_data_row:nth-child(3) > td.o_data_cell'
            self.assertTrue(self.js(
                "document.querySelectorAll('.o_data_row').length >= 3"))
            with self.forced('.o_data_row', 'hover', index=2):
                got = self.style(cell, 'box-shadow')
            self.assertColour(first_colour(got['box-shadow']), ACTION[scheme],
                              alpha=HOVER_ALPHA[scheme])
            self.js("""for (const box of [...document.querySelectorAll(
                '.o_data_row .o_list_record_selector input')].slice(0, 2)) { box.click(); }""")
            self.wait("document.querySelectorAll('.o_data_row_selected').length === 2")
            self.js("new Promise((resolve) => setTimeout(resolve, 300))")
            for index in (0, 1):
                got = self.style('.o_data_row_selected > td.o_data_cell', 'background-color',
                                 'border-bottom-color', 'border-bottom-width', 'color',
                                 index=index)
                self.assertColour(got['background-color'], bg)
                self.assertColour(got['border-bottom-color'], line)
                self.assertEqual(got['border-bottom-width'], '1px')
                self.assertColour(got['color'], BLACK_ROLE[scheme])

    def test_A64_row_hover_selection_light(self):
        self._hover_selection('light')

    def test_A64_row_hover_selection_dark(self):
        self._hover_selection('dark')

    def _grouped(self, scheme):
        with self.list_page(scheme, grouped=True):
            self.list_ready('.o_group_header')
            self.js("document.querySelector('.o_group_header').click()")
            self.wait("!!document.querySelector('.o_group_header + .o_data_row')")
            self.js("new Promise((resolve) => setTimeout(resolve, 300))")
            got = self.style('.o_group_header + .o_data_row > td.o_data_cell', 'background-image')
            image = got['background-image']
            self.assertEqual(image.count('linear-gradient'), 2, image)
            self.assertRegex(image, r'rgba\(0, 0, 0, 0\.02[45]\)')  # 2.5 % in 8 bits
            self.assertIn('4px', image)
            self.assertIn('2px', image)
            # the second record row has no such shadow
            got = self.style('.o_data_row + .o_data_row > td.o_data_cell', 'background-image')
            self.assertEqual(got['background-image'], 'none')
            got = self.style('.o_list_footer td', 'color', 'font-weight', 'background-color')
            self.assertColour(got['color'], BLACK_ROLE[scheme])
            self.assertEqual(got['font-weight'], '500')
            self.assertColour(got['background-color'], '#000000', alpha=0)
            empties = self.js("""[...document.querySelectorAll('.o_list_footer td:empty')]
                .map((td) => getComputedStyle(td).padding)""")
            self.assertTrue(empties)
            for padding in empties:
                self.assertEqual(padding, '0px')

    def test_A66_grouped_list_light(self):
        self._grouped('light')

    def test_A66_grouped_list_dark(self):
        self._grouped('dark')

    def test_A68_list_beside_search_panel(self):
        with self.page(self.fixtures['apps_list_url'], scheme='light'):
            self.list_ready()
            self.wait("!!document.querySelector('.o_search_panel')")
            got = self.style(
                '.o_list_renderer', 'border-top-width', 'border-left-width',
                'border-right-width', 'border-bottom-width', 'border-top-left-radius',
                'border-top-right-radius', 'border-bottom-left-radius', 'margin-right',
                'border-top-color')
            self.assertEqual(
                (got['border-top-width'], got['border-left-width'], got['border-right-width']),
                ('1px', '1px', '1px'))
            self.assertEqual(got['border-bottom-width'], '0px')
            self.assertEqual(
                (got['border-top-left-radius'], got['border-top-right-radius']),
                ('12px', '12px'))
            self.assertEqual(
                (got['border-bottom-left-radius']), '0px')
            self.assertEqual(got['margin-right'], '16px')
            self.assertColour(got['border-top-color'], BORDER['light'])

    def test_A120_activity_sticky_blur(self):
        if not self.mail_installed():
            self.skipTest('the activity view needs the mail module')
        action = self.env['ir.actions.act_window'].create({
            'name': 'Cws activity probe', 'res_model': 'res.partner',
            'view_mode': 'activity,list',
        })
        self.env['ir.ui.view'].create({
            'name': 'cws.probe.activity', 'model': 'res.partner', 'type': 'activity',
            'arch': '<activity string="Probe"><templates><div t-name="activity-box">'
                    '<field name="name"/></div></templates></activity>',
        })
        with self.page(f"/odoo/action-{action.id}", scheme='light'):
            self.wait("!!document.querySelector('.o_activity_view thead th')")
            got = self.style('.o_activity_view thead th', 'backdrop-filter')
            self.assertEqual(got['backdrop-filter'], 'blur(2px)')

    # -- pivot --------------------------------------------------------------------

    def _pivot(self, scheme):
        with self.page(f"/odoo/action-{self.fixtures['pivot_action']}", scheme=scheme):
            self.wait("!!document.querySelector('.o_pivot_cell_value')")
            self.js("new Promise((resolve) => setTimeout(resolve, 600))")
            got = self.style('.o_pivot_cell_value', 'background-color')
            self.assertColour(got['background-color'], VIEW[scheme])
            # the button row has no extra top margin
            self.assertEqual(
                self.style('.o_pivot_buttons', 'margin-top')['margin-top'], '0px')
            # a hovered row of the table takes the table hover colour
            with self.forced('.o_pivot tbody tr', 'hover'):
                got = self.style('.o_pivot_cell_value', 'box-shadow')
            self.assertColour(first_colour(got['box-shadow']), ACTION[scheme],
                              alpha=HOVER_ALPHA[scheme])
            # the pointer on a cell marks it
            self.pointer_to('.o_pivot_cell_value')
            self.wait("!!document.querySelector('.o_pivot_cell_value.o_cell_hover')")
            got = self.style('.o_pivot_cell_value.o_cell_hover', 'background-image')
            self.assertColour(first_colour(got['background-image']), ACTION[scheme],
                              alpha=HOVER_ALPHA[scheme])

    def test_A70_pivot_light(self):
        self._pivot('light')

    def test_A70_pivot_dark(self):
        self._pivot('dark')

    # -- graph --------------------------------------------------------------------


    CANVAS = '.o_graph_canvas_container canvas'
    PIXEL_JS = """(chartX, chartY) => {
        const canvas = document.querySelector('CANVAS_SEL');
        const scale = canvas.width / canvas.clientWidth;
        const px = canvas.getContext('2d').getImageData(
            Math.round(chartX * scale), Math.round(chartY * scale), 1, 1).data;
        return [px[0], px[1], px[2]];
    }"""

    def chart_page(self, scheme):
        return self.page(f"/odoo/action-{self.fixtures['graph_action']}", scheme=scheme)

    def chart_ready(self, mode):
        self.wait(f"!!document.querySelector('{self.CANVAS}')")
        if mode != 'bar':
            self.js(f"document.querySelector('.o_switcher [data-mode={mode}]').click()")
        self.wait(f"Chart.getChart(document.querySelector('{self.CANVAS}'))"
                  f"?.config.type === '{mode}'")
        # the chart animation ends
        self.js("new Promise((resolve) => setTimeout(resolve, 1200))")

    def pixel(self, x, y):
        script = self.PIXEL_JS.replace('CANVAS_SEL', self.CANVAS)
        return self.js(f"({script})({x}, {y})")

    def test_A72_bars_legend(self):
        with self.chart_page('light'):
            self.chart_ready('bar')
            got = self.js("""(() => {
                const chart = Chart.getChart(document.querySelector('CANVAS_SEL'));
                return {
                    width: chart.options.plugins.legend.labels.boxWidth,
                    radius: chart.options.plugins.legend.labels.borderRadius,
                    useRadius: chart.options.plugins.legend.labels.useBorderRadius,
                    border: chart.options.elements.bar.borderWidth,
                    datasetBorder: chart.data.datasets.map((d) => d.borderWidth),
                    fill: typeof chart.data.datasets[0].backgroundColor,
                };
            })()""".replace('CANVAS_SEL', self.CANVAS))
            self.assertEqual(got['width'], 30)
            self.assertEqual(got['radius'], 4)
            self.assertTrue(got['useRadius'])
            self.assertEqual(got['border'], 0)
            self.assertEqual(set(got['datasetBorder']), {0})
            self.assertEqual(got['fill'], 'string')  # flat fill

    def _line_fill(self, scheme):
        end = {'light': (255, 255, 255), 'dark': (0x26, 0x2A, 0x36)}[scheme]
        with self.chart_page(scheme):
            self.chart_ready('line')
            geometry = self.js("""(() => {
                const chart = Chart.getChart(document.querySelector('CANVAS_SEL'));
                const point = chart.getDatasetMeta(0).data.find(
                    (p) => p.y < chart.chartArea.bottom - 40);
                return {x: point.x, y: point.y, bottom: chart.chartArea.bottom,
                        base: chart.data.datasets[0].borderColor};
            })()""".replace('CANVAS_SEL', self.CANVAS))
            self.assertTrue(geometry)
            # at the bottom of the chart area the fill reaches the fixed end colour
            bottom = self.pixel(geometry['x'], geometry['bottom'] - 3)
            for got, want in zip(bottom, end, strict=True):
                self.assertAlmostEqual(got, want, delta=8, msg=f'{bottom} vs {end}')
            # right under the line it is the lighter (darker in dark) variant of the base
            base = hex_rgb(geometry['base'])
            near = self.pixel(geometry['x'], geometry['y'] + 4)
            goal = 255 if scheme == 'light' else 0
            for got, colour in zip(near, base, strict=True):
                self.assertAlmostEqual(got, round((colour + goal) / 2), delta=40,
                                       msg=f'{near} vs {base}')

    def test_A73_line_fill_light(self):
        self._line_fill('light')

    def test_A73_line_fill_dark(self):
        self._line_fill('dark')

    def _pie_fill(self, scheme):
        with self.chart_page(scheme):
            self.chart_ready('pie')
            geometry = self.js("""(() => {
                const chart = Chart.getChart(document.querySelector('CANVAS_SEL'));
                const arc = chart.getDatasetMeta(0).data[0];
                const angle = (arc.startAngle + arc.endAngle) / 2;
                return {x: arc.x, y: arc.y, outer: arc.outerRadius, angle,
                        base: chart.data.datasets[0].cwsBaseColours[0],
                        border: chart.data.datasets[0].borderWidth};
            })()""".replace('CANVAS_SEL', self.CANVAS))
            self.assertEqual(geometry['border'], 0)

            def at(fraction):
                radius = geometry['outer'] * fraction
                return self.pixel(geometry['x'] + radius * math.cos(geometry['angle']),
                                  geometry['y'] + radius * math.sin(geometry['angle']))

            centre, edge = at(.05), at(.97)
            for got, want in zip(centre, hex_rgb(geometry['base']), strict=True):
                self.assertAlmostEqual(got, want, delta=12)
            if scheme == 'light':
                self.assertGreater(sum(edge), sum(centre) + 15)
            else:
                self.assertLess(sum(edge), sum(centre) - 15)
            # the tooltip swatch repeats the fill
            box = self.rect(self.CANVAS)
            x = box['x'] + geometry['x'] + geometry['outer'] * .5 * math.cos(geometry['angle'])
            y = box['y'] + geometry['y'] + geometry['outer'] * .5 * math.sin(geometry['angle'])
            self.browser._websocket_request('Input.dispatchMouseEvent', params={
                'type': 'mouseMoved', 'x': x, 'y': y})
            self.wait("!!document.querySelector('.o_graph_custom_tooltip .o_square')")
            got = self.style('.o_graph_custom_tooltip .o_square', 'background-image')
            self.assertIn('radial-gradient', got['background-image'])

    def test_A74_pie_fill_light(self):
        self._pie_fill('light')

    def test_A74_pie_fill_dark(self):
        self._pie_fill('dark')

    def test_A76_first_paint_without_error(self):
        # a chart drawn before its size is known must not raise; every mode is entered
        with self.chart_page('light'):
            self.chart_ready('bar')
            for mode in ('line', 'pie', 'bar'):
                self.js(f"document.querySelector('.o_switcher [data-mode={mode}]').click()")
                self.js("new Promise((resolve) => setTimeout(resolve, 400))")
            self.assertFalse(self.js("!!document.querySelector('.o_error_dialog')"))

    def test_R28_graph_top_margin(self):
        with self.chart_page('light'):
            self.chart_ready('bar')
            self.assertEqual(
                self.style('.o_graph_renderer > :first-child', 'margin-top')['margin-top'], '0px')


WEEK_CALENDAR = """
<calendar string="Fixture" date_start="create_date" mode="week" color="color">
    <field name="name"/>
    <field name="country_id" filters="1"/>
</calendar>
"""
SCHEDULE_CALENDAR = """
<calendar string="Fixture" date_start="lastcall" mode="week" schedule="1">
    <field name="cron_name"/>
</calendar>
"""
BORDER_SECONDARY = {'light': '#CED4DA', 'dark': '#3E3F47'}
TABS = '.o_base_settings_view .settings_tab'


def rgb(value):
    """The first rgb() colour of a computed style value, as a hex string."""
    match = re.search(r'rgba?\((\d+),\s*(\d+),\s*(\d+)', value)
    assert match, value
    return '#' + ''.join(f'{int(c):02X}' for c in match.groups())


@tagged('post_install', '-at_install')
class TestThemeCalendarFormSettings(ShellProbeCase):
    """Calendar, form sheet and stat buttons, settings, login page, bottom sheet
    (001b R29-R31, R34, R37, R38)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        env = cls.env
        country = env['res.country'].search([], limit=2)
        partners = env['res.partner'].search([('ref', '=', MARK)])
        for index, partner in enumerate(partners):
            partner.country_id = country[index % len(country)]
        # a partner form with a property (a selection with two values)
        definition = env['properties.base.definition']._get_definition_for_property_field(
            'res.partner', 'properties')
        definition.properties_definition = [{
            'name': 'cws_sel', 'string': 'Sel', 'type': 'selection',
            'selection': [['a', 'A'], ['b', 'B']],
        }]
        properties_action = _action(
            env, 'properties',
            [('form', '<form><sheet><field name="name"/>'
             '<field name="properties_base_definition_id" invisible="1"/>'
             '<field name="properties"/></sheet></form>')])
        cls.properties_url = f'/odoo/action-{properties_action.id}/{partners[0].id}'
        week = _action(env, 'week', [('calendar', WEEK_CALENDAR)])
        cls.week_url = f'/odoo/action-{week.id}'
        env['ir.cron'].search([], limit=1).lastcall = fields.Datetime.now()
        schedule = _action(
            env, 'schedule', [('calendar', SCHEDULE_CALENDAR)], model='ir.cron',
            domain=[('id', '>', 0)])
        cls.schedule_url = f'/odoo/action-{schedule.id}'
        switch = _action(
            env, 'switch', [('kanban', KANBAN.replace('{group}', 'type')), ('list', LIST)])
        cls.switch_url = f'/odoo/action-{switch.id}'

    def ready(self, selector):
        self.wait(f"!!document.querySelector('{selector}')")
        self.js("new Promise((resolve) => setTimeout(resolve, 600))")

    # -- A77 / A78 / A117 calendar ----------------------------------------------------

    def test_A77_calendar_frame(self):
        with self.page(self.week_url, size=(1600, 900)):
            self.ready('.fc-timegrid-col')
            area = self.style('.o_calendar_container', 'background-color')
            self.assertColour(area['background-color'], '#000000', alpha=0)
            header = self.style(
                '.o_calendar_header', 'border-bottom-width', 'padding-top', 'padding-bottom',
                'margin-bottom')
            self.assertEqual(tuple(header.values()), ('0px', '0px', '0px', '16px'))
            frame = self.style(
                '.o_calendar_renderer', 'background-color', 'border-top-width',
                'border-left-width', 'border-right-width', 'border-bottom-width',
                'border-top-left-radius', 'border-top-right-radius',
                'border-bottom-left-radius', 'border-bottom-right-radius',
                'margin-left', 'margin-right')
            self.assertColour(frame['background-color'], VIEW['light'])
            self.assertEqual(
                [frame[k] for k in ('border-top-width', 'border-left-width',
                                    'border-right-width', 'border-bottom-width')],
                ['1px', '1px', '1px', '0px'])
            self.assertEqual(
                [frame[k] for k in ('border-top-left-radius', 'border-top-right-radius',
                                    'border-bottom-left-radius', 'border-bottom-right-radius')],
                ['12px', '12px', '0px', '0px'])
            self.assertEqual((frame['margin-left'], frame['margin-right']), ('16px', '16px'))
            # the last column draws no right border of its own
            widths = self.js(
                "[...document.querySelectorAll('.o_calendar_renderer "
                ".fc-timegrid-cols td:last-child, .o_calendar_renderer "
                ".fc-col-header-cell:last-child')]"
                ".map((el) => getComputedStyle(el).borderRightWidth)")
            self.assertTrue(widths)
            self.assertEqual(set(widths), {'0px'})

    def test_A78_calendar_side_panel(self):
        with self.page(self.week_url, size=(1600, 900)):
            self.ready('.o_calendar_filter')
            panel = self.style(
                '.o_calendar_sidepanel_container', 'background-color', 'padding-left',
                'padding-right')
            self.assertColour(panel['background-color'], '#000000', alpha=0)
            self.assertEqual((panel['padding-left'], panel['padding-right']), ('0px', '16px'))
            self.assertEqual(
                self.style('.o_calendar_sidepanel_content', 'margin-right')['margin-right'],
                '8px')
            self.assertEqual(
                self.style('.o_calendar_filter', 'margin-top')['margin-top'], '16px')
        with self.page(self.week_url, size=(390, 844), touch=True):
            self.ready('.o_other_calendar_panel')
            got = self.style('.o_other_calendar_panel', 'padding-left', 'padding-right')
            self.assertEqual((got['padding-left'], got['padding-right']), ('8px', '16px'))

    def test_A117_unscheduled_zone(self):
        with self.page(self.schedule_url, size=(1600, 900)):
            self.ready('.fc-event')
            # the zone shows while a scheduled event is dragged
            self.pointer_to('.fc-event')  # scrolls it into view
            box = self.rect('.fc-event')
            request = self.browser._websocket_request
            x, y = box['x'] + 10, box['y'] + min(box['height'] / 2, 10)
            request('Input.dispatchMouseEvent', params={
                'type': 'mouseMoved', 'x': x, 'y': y})
            request('Input.dispatchMouseEvent', params={
                'type': 'mousePressed', 'x': x, 'y': y, 'button': 'left', 'clickCount': 1})
            for step in range(1, 11):
                self.js("new Promise((resolve) => setTimeout(resolve, 60))")
                request('Input.dispatchMouseEvent', params={
                    'type': 'mouseMoved', 'x': x - 20 * step, 'y': y + 15 * step,
                    'button': 'left', 'buttons': 1})
            try:
                self.wait("!!document.querySelector('.o_calendar_unschedule_zone')", timeout=10)
                got = self.style(
                    '.o_calendar_unschedule_zone', 'border-top-left-radius',
                    'border-bottom-right-radius', 'margin-bottom')
                self.assertEqual(tuple(got.values()), ('12px', '12px', '16px'))
            finally:
                request('Input.dispatchMouseEvent', params={
                    'type': 'mouseReleased', 'x': x - 200, 'y': y + 150,
                    'button': 'left', 'clickCount': 1})

    # -- A80 sheet and stat button ----------------------------------------------------

    def _sheet(self, scheme):
        value = {'light': '#714B67', 'dark': '#C175AD'}[scheme]
        hover = {'light': '#E7EBED', 'dark': '#3E3F47'}[scheme]
        button = '.o-form-buttonbox .oe_stat_button.btn-outline-secondary'
        with self.page(self.fixtures['form_record_url'], scheme=scheme, size=(1600, 900)):
            self.ready(button)
            sheet = self.style(
                '.o_form_sheet', 'border-top-left-radius', 'border-bottom-right-radius',
                'padding-top', 'padding-left', 'padding-right', 'padding-bottom',
                'border-top-width', 'border-left-width', 'background-color')
            self.assertEqual(sheet['border-top-left-radius'], '8px')
            self.assertEqual(sheet['border-bottom-right-radius'], '8px')
            self.assertEqual(
                [sheet[k] for k in ('padding-top', 'padding-left', 'padding-right',
                                    'padding-bottom')], ['24px'] * 4)
            self.assertEqual((sheet['border-top-width'], sheet['border-left-width']),
                             ('1px', '1px'))
            self.assertColour(sheet['background-color'], VIEW[scheme])
            # no top padding of the status bar row and the sheet area
            self.assertEqual(
                self.style('.o_form_statusbar', 'padding-top')['padding-top'], '0px')
            self.assertEqual(
                self.style('.o_form_sheet_bg', 'padding-top')['padding-top'], '0px')
            rest = self.style(button, 'background-color', 'border-top-color')
            self.assertColour(rest['background-color'], VIEW[scheme])
            self.assertColour(rest['border-top-color'], BORDER_SECONDARY[scheme])
            self.assertAlmostEqual(self.rect(button)['height'], 33, delta=.6)
            text = self.style(f'{button} .o_stat_text', 'font-size')
            self.assertEqual(text['font-size'], '12px')
            figure = self.style(f'{button} .o_stat_value', 'color', 'font-weight')
            self.assertColour(figure['color'], value)
            self.assertEqual(figure['font-weight'], '500')
            icon = self.style(f'{button} .o_button_icon', 'color', 'font-size')
            self.assertEqual(icon['font-size'], '21px')
            if scheme == 'light':
                self.assertColour(icon['color'], value)
            else:
                self.assertEqual(icon['color'], self.style(button, 'color')['color'])
            with self.forced(button, 'hover'):
                got = self.style(button, 'background-color', 'border-top-color')
                self.assertColour(got['background-color'], hover)
                self.assertColour(got['border-top-color'], GREY_400[scheme])

    def test_A80_sheet_and_stat_button_light(self):
        self._sheet('light')

    def test_A80_sheet_and_stat_button_dark(self):
        self._sheet('dark')

    # -- A82 settings -----------------------------------------------------------------

    def _settings(self, scheme):
        active = {'light': '#E6F2F3', 'dark': '#1F2F31'}[scheme]
        accent = {'light': '#017E84', 'dark': '#1CBCB1'}[scheme]
        column = {'light': '#F8F9FA', 'dark': '#1F1F23'}[scheme]
        band = {'light': '#E7EBED', 'dark': '#3E3F47'}[scheme]
        selected = f'{TABS} .tab.selected'
        with self.page(self.fixtures['settings_url'], scheme=scheme, size=(1600, 900)):
            self.ready(selected)
            self.assertEqual(
                self.style('.o_control_panel', 'margin-bottom')['margin-bottom'], '0px')
            got = self.style(
                selected, 'background-color', 'height', 'font-size', 'padding-left',
                'padding-right', 'box-shadow', 'border-top-left-radius',
                'border-bottom-left-radius', 'border-top-right-radius',
                'border-bottom-right-radius')
            self.assertColour(got['background-color'], active)
            self.assertEqual(got['height'], '40px')
            self.assertEqual(got['font-size'], '13px')
            self.assertEqual((got['padding-left'], got['padding-right']), ('16px', '32px'))
            self.assertEqual(
                [got[k] for k in ('border-top-left-radius', 'border-bottom-left-radius',
                                  'border-top-right-radius', 'border-bottom-right-radius')],
                ['0px', '0px', '8px', '8px'])
            shadow = got['box-shadow']
            self.assertRegex(shadow, r'2px 0px 0px 0px inset|inset 2px 0px 0px 0px')
            self.assertColour(rgb(shadow), accent)
            self.assertColour(self.style(TABS, 'background-color')['background-color'], column)
            self.wait("!!document.querySelector('.settings .app_settings_block h2')")
            title = self.style(
                '.settings .app_settings_block h2', 'background-color', 'font-size',
                'font-weight', 'padding-left', 'color')
            self.assertColour(title['background-color'], band)
            self.assertEqual(
                (title['font-size'], title['font-weight'], title['padding-left']),
                ('15px', '500', '32px'))
            self.assertColour(title['color'], {'light': '#000000', 'dark': '#FFFFFF'}[scheme])
            field = self.style(
                '.o_base_settings_view .o_searchview', 'border-top-left-radius',
                'border-top-right-radius', 'background-color')
            self.assertEqual(
                (field['border-top-left-radius'], field['border-top-right-radius']),
                ('6px', '6px'))
            if scheme == 'dark':
                self.assertColour(field['background-color'], PAGE['dark'])

    def test_A82_settings_tabs_light(self):
        self._settings('light')

    def test_A82_settings_tabs_dark(self):
        self._settings('dark')

    # -- A86 / A124 login page ----------------------------------------------------------

    def test_A86_login_page(self):
        # a remembered dark scheme does not reach the login page (E4)
        with self.page('/web/login', scheme='dark', login=None):
            self.wait("!!document.querySelector('.oe_login_form')")
            self.assertEqual(
                self.js("document.querySelector('meta[name=color-scheme]').content"), 'light')
            self.assertEqual(self.js(
                "getComputedStyle(document.documentElement)"
                ".getPropertyValue('--o-cws-scheme').trim()"), '')
            body = self.style(
                'body', 'background-color', 'background-image', 'background-size')
            self.assertColour(body['background-color'], PAGE['light'])
            # five layers: three linear gradients, the haze and the dot grid
            self.assertEqual(body['background-image'].count('gradient('), 5)
            self.assertEqual(body['background-image'].count('radial-gradient('), 2)
            self.assertIn('12px 12px', body['background-size'])
            self.assertIn('rgb(0, 0, 0)', body['background-image'])  # the dots
            self.assertIn('rgba(233, 236, 239, 0.95)', body['background-image'])  # the haze
            card = self.style('.card.o_database_list', 'background-color', 'box-shadow')
            self.assertColour(card['background-color'], '#FFFFFF')
            self.assertNotEqual(card['box-shadow'], 'none')

    def test_A124_login_card_corners(self):
        for size, touch in (((1600, 900), False), ((390, 844), True)):
            with self.page('/web/login', scheme='light', login=None, size=size, touch=touch):
                self.wait("!!document.querySelector('.oe_login_form')")
                got = self.style(
                    '.card.o_database_list', 'border-top-left-radius',
                    'border-top-right-radius', 'border-bottom-right-radius',
                    'border-bottom-left-radius')
                for value in got.values():
                    self.assertAlmostEqual(px(value), 6, delta=1, msg=str(size))

    # -- A92 bottom sheet --------------------------------------------------------------

    def test_A92_bottom_sheet_views_dark(self):
        with self.page(self.switch_url, scheme='dark', size=(390, 844), touch=True):
            self.ready('.o_cp_switch_buttons')
            self.js("document.querySelector('.o_cp_switch_buttons .btn').click()")
            self.wait("!!document.querySelector('.o_bottom_sheet .o_cp_switch_buttons .selected')")
            self.js("new Promise((resolve) => setTimeout(resolve, 500))")
            item = '.o_bottom_sheet .o_cp_switch_buttons .o-dropdown-item'
            other = self.style(f'{item}:not(.selected)', 'background-color')
            self.assertColour(other['background-color'], '#56575E')
            active = self.style(f'{item}.selected', 'border-top-color')
            self.assertColour(active['border-top-color'], '#1CBCB1')

    def test_A92_bottom_sheet_statusbar_dark(self):
        with self.page(self.fixtures['form_record_url'], scheme='dark',
                       size=(390, 844), touch=True):
            self.ready('.o_statusbar_status .dropdown-toggle')
            self.js("[...document.querySelectorAll('.o_statusbar_status .dropdown-toggle')]"
                    ".find((el) => el.offsetParent).click()")
            entry = '.o_bottom_sheet .dropdown-item.active'
            self.wait(f"!!document.querySelector('{entry}')")
            self.js("new Promise((resolve) => setTimeout(resolve, 500))")
            got = self.style(entry, 'background-color', 'color')
            self.assertColour(got['background-color'], '#56575E', alpha=.5)
            self.assertColour(got['color'], '#FFFFFF')

    # -- A115 properties in dark ----------------------------------------------------------

    def test_A115_dark_rules_compiled(self):
        def compiled(bundle):
            asset = self.env['ir.qweb']._get_asset_bundle(bundle)
            return re.sub(r'\s+', '', asset.css().raw.decode()).lower().replace(';}', '}')

        dark = compiled('web.assets_web_dark')
        self.assertRegex(dark, r'\.o_field_property_definition_type_menuimg\{filter:invert\(1\)')
        self.assertRegex(dark, r'\.o_field_property_selection_option\{background-color:#3e3f47')
        self.assertNotIn(
            '.o_field_property_selection_option{background-color', compiled('web.assets_web'))

    def test_A115_property_fields_dark(self):
        popover = '.o_field_property_definition'
        with self.page(self.properties_url, scheme='dark', size=(1600, 900)):
            self.ready('.o_cp_action_menus button')
            # the cog menu turns the property editor on
            self.js("document.querySelector('.o_cp_action_menus button').click()")
            entries = "[...document.querySelectorAll('.o-dropdown-item')]"
            self.wait(f"{entries}.some((el) => el.textContent.includes('Edit Properties'))")
            self.js(f"{entries}.find((el) => el.textContent.includes('Edit Properties')).click()")
            self.wait("!!document.querySelector('.o_field_property_add button')")
            self.js("document.querySelector('.o_field_property_add button').click()")
            kind = f'{popover} .o_field_property_definition_type img'
            self.wait(f"!!document.querySelector('{kind}')")
            self.js("new Promise((resolve) => setTimeout(resolve, 500))")
            icon = self.style(kind, 'filter')
            self.assertEqual(icon['filter'], 'invert(1)')
            # switch the new property to the selection type and add a value
            self.js(f"document.querySelector('{popover} .o_select_menu_toggler').click()")
            self.wait("!!document.querySelector('.o_field_property_definition_type_menu')")
            self.js(
                "[...document.querySelectorAll('.o_field_property_definition_type_menu "
                ".o_select_menu_item')].find((el) => "
                "el.querySelector('img[src$=\"selection.png\"]')).click()")
            self.wait(f"!!document.querySelector('{popover} .o_field_property_selection')")
            add = f"{popover} .o_field_property_selection > div > button.btn-link.btn-sm"
            self.js(f"document.querySelector('{add}').click()")
            option = f'{popover} .o_field_property_selection_option'
            self.js("new Promise((resolve) => setTimeout(resolve, 500))")
            self.wait(f"!!document.querySelector('{option}')")
            got = self.style(option, 'background-color')
            self.assertColour(got['background-color'], '#3E3F47')
