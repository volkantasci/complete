# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Slice 001e look polish: focused list items (R1), phone sheet inset (R2), iOS row colours
(R3) and the phone tile box (R6)."""
from odoo.tests import tagged

from .test_ios_list import PHONE, UA_ANDROID, UA_IOS
from .test_theme_components import OverlayMixin
from .theme_probe import ThemeProbeCase, parse_colour

SUGGESTIONS = '.o_searchview_autocomplete'
SUGGESTION = f'{SUGGESTIONS} .o-dropdown-item'
BODY = {'light': '#212529', 'dark': '#EBEBEB'}
BLACK_ROLE = {'light': '#000000', 'dark': '#FFFFFF'}
WASH = {'light': '#000000', 'dark': '#FFFFFF'}
ACTION = {'light': '#017E84', 'dark': '#1CBCB1'}
TOGGLER = '.o_dialog .o_field_widget[name="lang"] .o_select_menu_toggler'
TILE = '.o_home_menu .o_apps .o_app'
TILE_ICON = f'{TILE} .o_app_icon'
TILE_NAME = f'{TILE} .o_caption'


@tagged('post_install', '-at_install')
class TestPolish(OverlayMixin, ThemeProbeCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # a second language: the Language list has more than one choice
        cls.env['res.lang']._activate_lang('fr_FR')
        # enough applications for two rows of four tiles, whatever is installed
        action = f"ir.actions.act_window,{cls.fixtures['kanban_action']}"
        for index in range(6):
            cls.env['ir.ui.menu'].create({
                'name': f'Cws polish {index}', 'action': action,
                'web_icon': 'base,static/description/icon.png',
            })

    def assertBox(self, got, want, delta=1):
        for key, value in want.items():
            self.assertAlmostEqual(got[key], value, delta=delta, msg=key)

    def assertWash(self, css, scheme, alpha):
        self.assertColour(css, WASH[scheme], alpha=alpha)

    def assertTransparent(self, css):
        self.assertEqual(parse_colour(css)[3], 0, css)

    def _open_preferences(self):
        self.open_user_menu()
        self.js("document.querySelector('[data-menu=\"preferences\"]').click()")
        self.wait("!!document.querySelector('.o_dialog .modal-content .o_form_view')")
        self.wait(f"!!document.querySelector('{TOGGLER}')")
        self.js(f"document.querySelector('{TOGGLER}').click()")

    # -- A1 ------------------------------------------------------------------------

    def test_001e_a1_focused_item_body_text(self):
        item = '.o_select_menu_menu .o_select_menu_item'
        for scheme in ('light', 'dark'):
            with self.page(self.fixtures['apps_kanban_url'], scheme=scheme):
                self.wait("!!document.querySelector('.o_searchview_input')")
                self.js("""(() => {
                    const input = document.querySelector('.o_searchview_input');
                    input.focus();
                    input.value = 'a';
                    input.dispatchEvent(new Event('input', {bubbles: true}));
                })()""")
                self.wait(f"document.querySelectorAll('{SUGGESTION}').length > 1")
                self.js("new Promise((resolve) => setTimeout(resolve, 400))")
                # the first suggestion is the one the keyboard is on
                self.assertTrue(self.js(
                    f"document.querySelector('{SUGGESTION}').classList.contains('focus')"))
                focused = self.style(SUGGESTION, 'color', 'background-color')
                self.assertColour(focused['color'], BODY[scheme])
                self.assertWash(focused['background-color'], scheme, .08)
                other = self.style(SUGGESTION, 'color', 'background-color', index=1)
                self.assertColour(other['color'], BODY[scheme])
                self.assertTransparent(other['background-color'])
                # pointing at the focused item gives the black role too
                with self.forced(SUGGESTION, 'hover', index=0):
                    self.assertColour(self.style(SUGGESTION, 'color', index=0)['color'],
                                      BLACK_ROLE[scheme])
                # pointing at an item still gives the black role
                with self.forced(SUGGESTION, 'hover', index=1):
                    self.assertColour(self.style(SUGGESTION, 'color', index=1)['color'],
                                      BLACK_ROLE[scheme])
                    self.assertWash(
                        self.style(SUGGESTION, 'background-color', index=1)['background-color'],
                        scheme, .08)
            # the Language list of the preferences dialog
            with self.page(self.fixtures['apps_kanban_url'], scheme=scheme):
                self._open_preferences()
                self.wait(f"!!document.querySelector('{item}')")
                self.js("new Promise((resolve) => setTimeout(resolve, 400))")
                self.assertTrue(self.js(
                    "!!document.querySelector('.o_select_menu_menu .o_select_menu_item.focus')"))
                focus = '.o_select_menu_menu .o_select_menu_item.focus'
                got = self.style(focus, 'color', 'background-color')
                self.assertColour(got['color'], BODY[scheme])
                self.assertWash(got['background-color'], scheme, .08)
                with self.forced(focus, 'hover'):
                    self.assertColour(self.style(focus, 'color')['color'], BLACK_ROLE[scheme])
                with self.forced(item, 'hover', index=1):
                    self.assertColour(self.style(item, 'color', index=1)['color'],
                                      BLACK_ROLE[scheme])

    # -- A2 ------------------------------------------------------------------------

    def test_001e_a2_phone_sheet_inset(self):
        menu = '.o_bottom_sheet .o_select_menu_menu .o_select_menu-choices'
        option = '.o_bottom_sheet .o_select_menu_item'
        for scheme in ('light', 'dark'):
            with self.page(self.fixtures['apps_kanban_url'], scheme=scheme, size=PHONE,
                           touch=True):
                self._open_preferences()
                self.wait(f"!!document.querySelector('{option}')")
                self.js("new Promise((resolve) => setTimeout(resolve, 700))")
                pad = self.style(menu, 'padding-top', 'padding-right', 'padding-bottom',
                                 'padding-left')
                self.assertEqual(set(pad.values()), {'4px'}, pad)
                self.assertBox(self.rect(menu), {'x': 0, 'width': 390})
                row = self.style(option, 'margin-left', 'margin-right', 'padding-left',
                                 'padding-right')
                self.assertEqual(
                    (row['margin-left'], row['margin-right'], row['padding-left'],
                     row['padding-right']), ('16px', '16px', '16px', '40px'))
                self.assertBox(self.rect(option), {'x': 20, 'width': 350, 'height': 57.109})

    def test_001e_a2_sheet_list_padding(self):
        # the list inside the sheet (the choices element) carries the padding, not the body
        body = '.o_bottom_sheet .o_select_menu_menu'
        choices = f'{body} .o_select_menu-choices'
        for scheme in ('light', 'dark'):
            with self.page(self.fixtures['apps_kanban_url'], scheme=scheme, size=PHONE,
                           touch=True):
                self._open_preferences()
                self.wait(f"!!document.querySelector('{choices} .o_select_menu_item')")
                self.js("new Promise((resolve) => setTimeout(resolve, 700))")
                pad = self.style(choices, 'padding-top', 'padding-right', 'padding-bottom',
                                 'padding-left')
                self.assertEqual(set(pad.values()), {'4px'}, pad)
                self.assertBox(self.rect(choices), {'x': 0, 'width': 390})
                # nothing around the list
                around = self.style(body, 'padding-top', 'padding-right', 'padding-bottom',
                                    'padding-left')
                self.assertEqual(set(around.values()), {'0px'}, around)

    def test_001e_a2_long_list_scrolls_to_edge(self):
        body = '.o_bottom_sheet .o_select_menu_menu'
        choices = f'{body} .o_select_menu-choices'
        option = f'{choices} .o_select_menu_item'
        for scheme in ('light', 'dark'):
            with self.page(self.fixtures['apps_kanban_url'], scheme=scheme, size=PHONE,
                           touch=True):
                self._open_preferences()
                self.wait(f"!!document.querySelector('{option}')")
                self.js("new Promise((resolve) => setTimeout(resolve, 700))")
                # make the list longer than the sheet by repeating its rows, then scroll down
                state = self.js(f"""(() => {{
                    const list = document.querySelector('{choices}');
                    const rows = [...list.querySelectorAll('.o_select_menu_item')];
                    for (let i = 0; i < 25; i++) {{
                        rows.forEach((row) => list.appendChild(row.cloneNode(true)));
                    }}
                    list.scrollTop = 400;
                    return {{
                        scrollable: list.scrollHeight > list.clientHeight,
                        top: list.scrollTop,
                    }};
                }})()""")
                self.assertTrue(state['scrollable'], state)
                self.assertGreater(state['top'], 0)
                self.js("new Promise((resolve) => setTimeout(resolve, 200))")
                box = self.rect(choices)
                # the list starts at the top edge of the sheet's body
                self.assertAlmostEqual(box['y'], self.rect(body)['y'], delta=1)
                # and a row runs up to that edge: it starts at or above it, and goes on below
                reach = self.js(f"""(() => {{
                    const top = document.querySelector('{choices}').getBoundingClientRect().top;
                    return [...document.querySelectorAll('{option}')]
                        .map((row) => row.getBoundingClientRect())
                        .filter((r) => r.bottom > top + 1)
                        .map((r) => r.top - top)[0];
                }})()""")
                self.assertLessEqual(reach, 1, reach)

    def test_001e_a2_desktop_list_unchanged(self):
        menu = '.o_select_menu_menu'
        with self.page(self.fixtures['apps_kanban_url']):
            self._open_preferences()
            self.wait(f"!!document.querySelector('{menu} .o_select_menu_item')")
            pad = self.style(menu, 'padding-top', 'padding-left')
            self.assertEqual(set(pad.values()), {'4px'}, pad)
            self.assertEqual(
                self.style(f'{menu} .o_select_menu-choices', 'padding-top')['padding-top'], '0px')

    # -- A4 ------------------------------------------------------------------------

    def test_001e_a4_ios_row_colours(self):
        for scheme in ('light', 'dark'):
            with self.page('/odoo', scheme=scheme, size=PHONE, touch=True, ua=UA_IOS):
                self.wait(f"document.querySelectorAll('{TILE}').length >= 2")
                self.js("new Promise((resolve) => setTimeout(resolve, 700))")
                row = self.style(
                    TILE, 'color', 'background-color', 'border-top-color', 'border-right-color',
                    'border-bottom-color', 'border-left-color', 'outline-color')
                for prop, value in row.items():
                    if prop == 'background-color':
                        self.assertColour(value, '#FFFFFF', alpha=.1)
                    else:
                        self.assertColour(value, ACTION[scheme])
                # the name keeps the colour of the earlier package
                self.assertColour(self.style(TILE_NAME, 'color')['color'],
                                  '#212529' if scheme == 'light' else '#FFFFFF', tol=1)

    def test_001e_a7_tablet_tile_row_stays(self):
        # from 768 px the tile padding is 8 px again: the grid gives 2 px less so the first
        # icon stays where 001b put it
        for scheme, top in (('light', 65), ('dark', 67)):
            with self.page('/odoo', scheme=scheme, size=(800, 900), touch=True):
                self.wait(f"document.querySelectorAll('{TILE}').length >= 5")
                self.js("new Promise((resolve) => setTimeout(resolve, 700))")
                self.assertEqual(self.style(TILE, 'padding-top')['padding-top'], '8px')
                self.assertAlmostEqual(self.rect(TILE_ICON)['y'], top, delta=1)

    # -- A7 ------------------------------------------------------------------------

    def test_001e_a7_phone_tile_box(self):
        for ua in (None, UA_ANDROID):
            for scheme, top in (('light', 61), ('dark', 63)):
                with self.page('/odoo', scheme=scheme, size=PHONE, touch=True, ua=ua):
                    self.wait(f"document.querySelectorAll('{TILE}').length >= 5")
                    self.js("new Promise((resolve) => setTimeout(resolve, 700))")
                    box = self.style(
                        TILE, 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                        'margin-top', 'margin-bottom')
                    self.assertEqual(
                        [box[k] for k in ('padding-top', 'padding-right', 'padding-bottom',
                                          'padding-left')], ['4px'] * 4)
                    self.assertEqual((box['margin-top'], box['margin-bottom']), ('0px', '0px'))
                    first = self.rect(TILE)
                    self.assertBox(first, {'x': 16, 'y': top, 'width': 89.5, 'height': 105.5})
                    fifth = self.rect(TILE, 4)
                    self.assertBox(fifth, {'x': 16, 'width': 89.5, 'height': 105.5})
                    self.assertAlmostEqual(fifth['y'] - first['y'], 121.5, delta=1)
                    self.assertBox(self.rect(TILE_ICON), {
                        'x': 25.75, 'y': top + 4, 'width': 70, 'height': 70})
                    self.assertBox(self.rect(TILE_NAME), {
                        'x': 20, 'y': top + 82, 'width': 81.5, 'height': 19.5})
