# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probe tests of the standard views: control panel, search bar, kanban, search panel
(001b R15, R23-R25, R32, R33, R38 colour picker and company switcher field, R42)."""
import colorsys
import re

from odoo.tests import tagged

from .test_theme_shell import SECTION_TOGGLE, ShellProbeCase

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
