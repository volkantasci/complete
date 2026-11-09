# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probe tests of the component look: buttons, badges, tags, ribbons (001b R16-R18, R41)."""
import base64
import io
import json
import re

from odoo.tests import tagged
from PIL import Image

from .theme_probe import ThemeProbeCase

NEW = '.o_control_panel .o-kanban-button-new'
BUTTON_PROPS = ('background-color', 'border-top-color', 'color')


def variant(name):
    return f'.o_cws_variants .o_cws_v_{name}'


@tagged('post_install', '-at_install')
class TestThemeButtons(ThemeProbeCase):
    def _kanban(self, scheme):
        url = f"/odoo/action-{self.fixtures['kanban_action']}"
        return self.page(url, scheme=scheme)

    def _form(self, scheme):
        return self.page(self.fixtures['form_record_url'], scheme=scheme)

    def _ready_form(self):
        self.wait("!!document.querySelector('.o_cws_variants .btn')")

    def _state(self, selector, expected, *states):
        """Assert background, border and text of ``selector`` while ``states`` are forced."""
        if states:
            with self.forced(selector, *states):
                got = self.style(selector, *BUTTON_PROPS)
        else:
            got = self.style(selector, *BUTTON_PROPS)
        for prop, want in zip(BUTTON_PROPS, expected, strict=True):
            label = f'{selector} {states or "rest"} {prop}'
            try:
                self.assertColour(got[prop], want)
            except AssertionError as error:
                raise AssertionError(f'{label}: {error}') from None

    def _no_shadow_no_transition(self, selector):
        for states in ((), ('hover',), ('active',)):
            if states:
                with self.forced(selector, *states):
                    got = self.style(selector, 'box-shadow', 'transition-duration')
            else:
                got = self.style(selector, 'box-shadow', 'transition-duration')
            self.assertEqual(got['box-shadow'], 'none', f'{selector} {states}')
            self.assertEqual(got['transition-duration'], '0s', f'{selector} {states}')

    def test_A33_group_overlap(self):
        with self._form('light'):
            self._ready_form()
            first = self.rect('.o_cws_group .btn', index=0)
            second = self.rect('.o_cws_group .btn', index=1)
            self.assertAlmostEqual(second['x'], first['x'] + first['width'] - 1, delta=.5)

    # -- primary -------------------------------------------------------------------

    def test_A33_primary_light(self):
        with self._kanban('light'):
            self.wait(f"!!document.querySelector('{NEW}')")
            self._state(NEW, ('#714B67', '#714B67', '#FFFFFF'))
            self._state(NEW, ('#52374B', '#52374B', '#FFFFFF'), 'hover')
            self._state(NEW, ('#F1EDF0', '#714B67', '#714B67'), 'active')
            self._no_shadow_no_transition(NEW)

    def test_A34_primary_dark(self):
        with self._kanban('dark'):
            self.wait(f"!!document.querySelector('{NEW}')")
            self._state(NEW, ('#92427D', '#92427D', '#FFFFFF'))
            self._state(NEW, ('#9D4786', '#9D4786', '#FFFFFF'), 'hover')
            self._state(NEW, ('#A74C8F', '#A74C8F', '#FFFFFF'), 'active')

    # -- secondary and light -------------------------------------------------------

    def test_A35_secondary_and_light(self):
        secondary, light = variant('secondary'), variant('light')
        with self._form('light'):
            self._ready_form()
            self._state(secondary, ('#FFFFFF', '#CED4DA', '#212529'))
            self._state(secondary, ('#E7EBED', '#CED4DA', '#000000'), 'hover')
            self._state(secondary, ('#E6F2F3', '#017E84', '#000000'), 'active')
            self.assertEqual(self.style(light, 'background-color')['background-color'],
                             'rgba(0, 0, 0, 0)')
            self._state(light, ('#E7EBED', '#E7EBED', '#000000'), 'hover')
            self._state(light, ('#E6F2F3', '#017E84', '#000000'), 'active')
        with self._form('dark'):
            self._ready_form()
            self._state(secondary, ('#2C2E35', '#3E3F47', '#EBEBEB'))
            self._state(secondary, ('#3E3F47', '#3E3F47', '#EBEBEB'), 'hover')
            self._state(secondary, ('#1F3738', '#2CE0D3', '#FFFFFF'), 'active')
            self._state(light, ('#3E3F47', '#3E3F47', '#FFFFFF'), 'hover')
            self._state(light, ('#1F3738', '#2CE0D3', '#FFFFFF'), 'active')

    # -- gloss and disabled --------------------------------------------------------

    def _gradient(self, selector, alpha, tone):
        image = self.style(selector, 'background-image')['background-image']
        match = re.fullmatch(
            r'linear-gradient\(145deg, rgba\(' + tone + r', ([0-9.]+)\), rgba\(0, 0, 0, 0\)\)',
            image,
        )
        self.assertTrue(match, f'{selector}: unexpected gloss {image!r}')
        self.assertAlmostEqual(float(match.group(1)), alpha, places=2)

    def test_A36_gloss_disabled(self):
        for scheme, alpha, tone in (('light', .15, '255, 255, 255'), ('dark', .08, '0, 0, 0')):
            with self._form(scheme):
                self._ready_form()
                self._gradient(variant('primary'), alpha, tone)
                self._gradient(variant('secondary'), alpha, tone)
                self.js(f"document.querySelector('{variant('secondary')}').disabled = true")
                self.assertEqual(
                    self.style(variant('secondary'), 'opacity')['opacity'], '0.5')

    def test_A36_gloss_not_in_dropdown_menus(self):
        with self._form('light'):
            self._ready_form()
            self.js(
                "(() => { const menu = document.createElement('div');"
                " menu.className = 'dropdown-menu show';"
                " menu.innerHTML = '<button class=\"btn btn-secondary o_cws_probe_in_menu\">'"
                " + 'x</button>';"
                " document.body.append(menu); })()"
            )
            self.assertEqual(
                self.style('.o_cws_probe_in_menu', 'background-image')['background-image'], 'none')

    # -- dark danger and outline ---------------------------------------------------

    def test_A37_dark_danger_outline(self):
        with self._form('dark'):
            self._ready_form()
            danger = variant('danger')
            self._state(danger, ('#CB2F2F', '#CB2F2F', '#FFFFFF'))
            self._state(danger, ('#D13838', '#D13838', '#FFFFFF'), 'hover')
            self._state(danger, ('#D44545', '#D44545', '#FFFFFF'), 'active')
            outline = variant('outline_primary')
            self.assertEqual(self.style(outline, 'background-color')['background-color'],
                             'rgba(0, 0, 0, 0)')
            got = self.style(outline, 'border-top-color', 'color')
            self.assertColour(got['border-top-color'], '#C175AD')
            self.assertColour(got['color'], '#C175AD')
            self._state(outline, ('#9D4786', '#9D4786', '#FFFFFF'), 'hover')
            self._state(outline, ('#A74C8F', '#A74C8F', '#FFFFFF'), 'active')
            red = variant('outline_danger')
            got = self.style(red, 'border-top-color', 'color')
            self.assertColour(got['border-top-color'], '#FF5757')
            self.assertColour(got['color'], '#FF5757')
            self._state(red, ('#D13838', '#D13838', '#FFFFFF'), 'hover')
            pale = variant('outline_light')
            got = self.style(pale, 'border-top-color', 'color')
            self.assertColour(got['border-top-color'], '#3E3F47')
            self.assertColour(got['color'], '#FFFFFF')
            with self.forced(pale, 'hover'):
                self.assertColour(self.style(pale, 'background-color')['background-color'],
                                  '#3E3F47')

    def test_A109_dark_outline_disabled_secondary(self):
        with self._form('dark'):
            self._ready_form()
            outline = variant('outline_secondary')
            self.assertEqual(self.style(outline, 'background-color')['background-color'],
                             'rgba(0, 0, 0, 0)')
            self.assertColour(self.style(outline, 'border-top-color')['border-top-color'],
                              '#3E3F47')
            secondary = variant('secondary')
            self.js(f"document.querySelector('{secondary}').disabled = true")
            got = self.style(secondary, *BUTTON_PROPS, 'opacity')
            self.assertColour(got['background-color'], '#3E3F47')
            self.assertColour(got['border-top-color'], '#3E3F47')
            self.assertEqual(got['opacity'], '0.5')

    # -- keyboard focus ------------------------------------------------------------

    def _tab_to(self, selector):
        self.js("document.activeElement.blur()")
        for _step in range(60):
            self.key('Tab')
            if self.js(f"document.activeElement.matches('{selector}')"):
                return
        self.fail(f'Tab never reached {selector}')

    def _ring(self, scheme, hover, ring, light_hover):
        with self._form(scheme):
            self._ready_form()
            primary, light = variant('primary'), variant('light')
            self._tab_to(primary)
            got = self.style(primary, 'background-color', 'box-shadow')
            self.assertColour(got['background-color'], hover)
            shadows = re.findall(r'(rgba?\([^)]*\)) 0px 0px 0px (\d+)px', got['box-shadow'])
            self.assertEqual([width for _colour, width in shadows], ['2', '4'], got['box-shadow'])
            self.assertColour(shadows[0][0], ring)
            self.assertColour(shadows[1][0], ring, alpha=.5)
            self.assertEqual(
                self.style(light, 'background-image')['background-image'], 'none')
            self._tab_to(light)
            got = self.style(light, 'background-color', 'background-image')
            self.assertColour(got['background-color'], light_hover)
            self.assertIn('linear-gradient', got['background-image'])

    def test_A108_focus_ring(self):
        self._ring('light', '#52374B', '#017E84', '#E7EBED')
        self._ring('dark', '#9D4786', '#1CBCB1', '#3E3F47')


@tagged('post_install', '-at_install')
class TestThemeBadgesTags(ThemeProbeCase):
    def _badge(self, scheme, tone, text):
        with self.page(f"/odoo/action-{self.fixtures['list_action']}", scheme=scheme):
            selector = '.o_data_row .o_field_badge .badge.text-bg-success'
            self.wait(f"!!document.querySelector('{selector}')")
            got = self.style(selector, 'background-color', 'color', 'border-top-left-radius',
                             'font-size', 'font-weight', 'padding-top', 'padding-left',
                             'height', 'background-image')
            self.assertColour(got['background-color'], tone, alpha=.15)
            self.assertColour(got['color'], text)
            self.assertEqual(got['font-size'], '12px')
            self.assertEqual(got['font-weight'], '500')
            self.assertGreaterEqual(float(got['border-top-left-radius'][:-2]), 10)
            self.assertAlmostEqual(float(got['padding-top'][:-2]), 3, delta=.05)
            self.assertGreaterEqual(float(got['padding-left'][:-2]), 9)
            self.assertAlmostEqual(self.rect(selector)['height'], 20, delta=.5)
            self.assertIn('linear-gradient(', got['background-image'])
            # top to bottom (the default direction is not serialised)
            self.assertTrue(got['background-image'].startswith('linear-gradient(rgba('))

    def test_A38_badges(self):
        self._badge('light', '#00A945', '#008818')
        self._badge('dark', '#22B053', '#30C06E')

    def test_A38_other_tones(self):
        # light and dark badges follow the same rule: the tone's colour at 15 % as
        # background and the colour itself as text (body text for the white light tone)
        cases = {
            'light': {'light': ('#FFFFFF', '#212529'), 'dark': ('#212529', '#212529')},
            'dark': {'light': ('#3E3F47', '#3E3F47'), 'dark': ('#B3B4B8', '#B3B4B8')},
        }
        for scheme, tones in cases.items():
            with self.page(f"/odoo/action-{self.fixtures['kanban_action']}", scheme=scheme):
                self.wait("!!document.querySelector('.o_cws_b_light')")
                for tone, (tint, text) in tones.items():
                    got = self.style(f'.o_cws_b_{tone}', 'background-color', 'color')
                    self.assertColour(got['background-color'], tint, alpha=.15)
                    self.assertColour(got['color'], text)

    def test_A39_card_badges(self):
        with self.page(f"/odoo/action-{self.fixtures['kanban_action']}"):
            selector = '.o_kanban_record .badge.text-bg-primary'
            self.wait(f"!!document.querySelector('{selector}')")
            got = self.style(selector, 'font-size', 'font-weight', 'line-height',
                             'border-top-left-radius', 'padding-left')
            # 0.77 em of the 13 px card text: 10 px
            self.assertEqual(
                self.style('.o_kanban_record', 'font-size')['font-size'], '13px')
            self.assertAlmostEqual(float(got['font-size'][:-2]), 10, delta=.2)
            self.assertEqual(got['font-weight'], '600')
            self.assertGreaterEqual(float(got['border-top-left-radius'][:-2]), 8)
            font = float(got['font-size'][:-2])
            self.assertAlmostEqual(float(got['line-height'][:-2]) / font, 1.166, delta=.02)
            self.assertAlmostEqual(float(got['padding-left'][:-2]) / font, .52, delta=.03)

    def test_A39_badge_empty_minimum_width(self):
        with self.page(f"/odoo/action-{self.fixtures['list_action']}"):
            selector = '.o_data_row .o_field_badge .badge'
            self.wait(f"!!document.querySelector('{selector}')")
            ruler = self.js(
                f"""(() => {{
                    const badge = document.querySelector('{selector}');
                    badge.style.minWidth = '0';
                    badge.style.padding = '0';
                    badge.style.width = '2.7ch';
                    const width = badge.getBoundingClientRect().width;
                    badge.style.minWidth = badge.style.padding = badge.style.width = '';
                    return width;
                }})()""")
            minimum = float(self.style(selector, 'min-width')['min-width'][:-2])
            self.assertAlmostEqual(minimum, ruler, delta=.5)


    def _tag(self, scheme, border, background, text):
        with self.page(f"/odoo/action-{self.fixtures['list_action']}", scheme=scheme):
            selector = '.o_data_row .o_tag.o_tag_color_1'
            self.wait(f"!!document.querySelector('{selector}')")
            got = self.style(selector, 'border-top-color', 'border-top-width', 'border-top-style',
                             'background-color', 'color', 'border-top-left-radius',
                             'background-image')
            self.assertColour(got['border-top-color'], border)
            self.assertEqual(got['border-top-width'], '1px')
            self.assertEqual(got['border-top-style'], 'solid')
            self.assertColour(got['background-color'], background)
            self.assertColour(got['color'], text)
            self.assertGreaterEqual(float(got['border-top-left-radius'][:-2]), 10)
            self.assertIn('linear-gradient(', got['background-image'])

    def test_A40_tags(self):
        self._tag('light', '#D76A58', '#FEDBD5', '#6B1F15')
        self._tag('dark', '#F8907E', '#58271F', '#FEC9BF')

    def test_A40_tag_cross_keeps_border(self):
        # the editable tags field of the form shows a removal cross inside the tag
        for scheme in ('light', 'dark'):
            with self.page(self.fixtures['form_record_url'], scheme=scheme):
                tag = '.o_field_many2many_tags .o_tag:has(.o_delete)'
                self.wait(f"!!document.querySelector('{tag}')")
                got = self.style(tag, 'border-top-width', 'border-top-style')
                self.assertEqual(
                    (got['border-top-width'], got['border-top-style']), ('1px', 'solid'))
                cross = self.style(f'{tag} .o_delete', 'border-top-width')
                self.assertEqual(cross['border-top-width'], '0px')


@tagged('post_install', '-at_install')
class TestThemeViewSwitcher(ThemeProbeCase):
    def test_A33_group_rule_spares_view_switcher(self):
        # the switcher keeps its own spacing (R21: 4px minus the border); the group
        # overlap rule must not change that for the control-panel view switcher
        with self.page(self.fixtures['apps_kanban_url']):
            nav = '.o_control_panel .o_cp_switch_buttons'
            self.wait(f"!!document.querySelector('{nav} .btn')")
            self.assertEqual(self.style(nav, 'column-gap')['column-gap'], '3px')


@tagged('post_install', '-at_install')
class TestThemeRibbon(ThemeProbeCase):
    def test_A98_ribbon(self):
        partner = self.env['res.partner'].create({'name': 'cws ribbon', 'active': False})
        url = f"/odoo/action-{self.fixtures['form_action']}/{partner.id}"
        for scheme, tone in (('light', '255, 255, 255'), ('dark', '0, 0, 0')):
            with self.page(url, scheme=scheme):
                selector = '.ribbon span'
                self.wait(f"!!document.querySelector('{selector}')")
                got = self.style(selector, 'box-shadow', 'text-shadow', 'background-image')
                self.assertEqual(got['box-shadow'], 'none')
                self.assertEqual(got['text-shadow'], 'none')
                self.assertRegex(
                    got['background-image'],
                    r'linear-gradient\(145deg, rgba\(' + tone + r', 0\.(15|08)\)')


SHADOW = re.compile(r'rgba\(0, 0, 0, ([0-9.]+)\) (-?\d+)px (-?\d+)px (\d+)px (-?\d+)px')
USER_MENU = '.o_user_menu'
MENU = '.o-dropdown--menu'
ITEM = '.o-dropdown--menu .dropdown-item'
OVERLAY_FRAME = {
    # scheme: (background, border, shadow alpha)
    'light': ('#FFFFFF', '#DEE2E6', .15),
    'dark': ('#3E3F47', '#56575E', .30),
}


class OverlayMixin:
    def _pixel(self, selector, fraction, height=None):
        """Rendered colour at ``fraction`` of an element's width, mid-height or ``height`` px down.

        The slider track and thumb are browser pseudo-elements whose computed style
        and matched rules are not exposed, so the probe reads the painted pixel.
        """
        self.js(
            f"document.querySelector('{selector}').scrollIntoView({{block: 'center'}});"
            " new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))"
        )
        box = self.rect(selector)
        # the clip is in document coordinates, the rect in viewport coordinates
        scroll = self.js('({x: window.scrollX, y: window.scrollY})')
        x = box['x'] + scroll['x'] + box['width'] * fraction
        y = box['y'] + scroll['y'] + (box['height'] / 2 if height is None else height)
        shot = self.browser._websocket_request('Page.captureScreenshot', params={
            'format': 'png',
            'clip': {'x': x, 'y': y, 'width': 1, 'height': 1, 'scale': 1},
        })
        image = Image.open(io.BytesIO(base64.b64decode(shot['data']))).convert('RGB')
        red, green, blue = image.getpixel((0, 0))
        return f'rgb({red}, {green}, {blue})'

    def _assert_pixel_aims_at_slider(self, selector, track):
        """Self-check of ``_pixel``: far above the slider the point is not the track."""
        got = self._pixel(selector, .1, height=-40)
        with self.assertRaises(AssertionError):
            self.assertColour(got, track, tol=0)

    def assertMark(self, image, mark):
        """The check mark of a control is drawn in white ('fff') or black ('000')."""
        names = {
            'fff': ('%23fff', '%23ffffff', 'white'),
            '000': ('%23000', '%23000000', 'black'),
        }[mark]
        self.assertTrue(any(name in image.lower() for name in names), image)

    def assertShadow(self, value, alpha, offset=(0, 8), blur=16):
        match = SHADOW.fullmatch(value)
        self.assertTrue(match, f'unexpected shadow {value!r}')
        self.assertAlmostEqual(float(match.group(1)), alpha, places=2)
        self.assertEqual(
            (int(match.group(2)), int(match.group(3)), int(match.group(4))),
            (offset[0], offset[1], blur),
        )

    def open_user_menu(self):
        self.wait(f"!!document.querySelector('{USER_MENU}')")
        self.js(f"document.querySelector('{USER_MENU}').click()")
        self.wait(f"!!document.querySelector('{ITEM}')")

    def assertFrame(self, selector, radius, scheme):
        background, border, alpha = OVERLAY_FRAME[scheme]
        got = self.style(
            selector, 'border-top-left-radius', 'border-bottom-right-radius', 'border-top-width',
            'border-top-style', 'border-top-color', 'background-color', 'box-shadow',
        )
        self.assertEqual(got['border-top-left-radius'], f'{radius}px')
        self.assertEqual(got['border-bottom-right-radius'], f'{radius}px')
        self.assertEqual((got['border-top-width'], got['border-top-style']), ('1px', 'solid'))
        self.assertColour(got['border-top-color'], border)
        self.assertColour(got['background-color'], background)
        self.assertShadow(got['box-shadow'], alpha)


@tagged('post_install', '-at_install')
class TestThemeDropdowns(OverlayMixin, ThemeProbeCase):
    def _kanban(self, scheme):
        return self.page(f"/odoo/action-{self.fixtures['kanban_action']}", scheme=scheme)

    def test_A42_dropdown(self):
        for scheme in ('light', 'dark'):
            with self._kanban(scheme):
                self.open_user_menu()
                self.assertFrame(MENU, 12, scheme)
                self.assertEqual(self.style(MENU, 'padding-top', 'padding-left'),
                                 {'padding-top': '4px', 'padding-left': '4px'})
                item = self.style(ITEM, 'border-top-left-radius', 'height')
                self.assertEqual(item['border-top-left-radius'], '8px')
                self.assertAlmostEqual(float(item['height'][:-2]), 27, delta=.5)
                with self.forced(ITEM, 'hover'):
                    got = self.style(ITEM, 'background-color', 'background-image', 'color')
                wash = ('#000000', '#FFFFFF')[scheme == 'dark']
                self.assertColour(got['background-color'], wash, alpha=.08)
                self.assertColour(got['color'], ('#000000', '#FFFFFF')[scheme == 'dark'])
                if scheme == 'dark':
                    self.assertRegex(
                        got['background-image'],
                        r'linear-gradient\(145deg, rgba\(0, 0, 0, 0\.08\), rgba\(0, 0, 0, 0\)\)',
                    )
                else:
                    self.assertEqual(got['background-image'], 'none')

    def test_A42_divider_spacing(self):
        with self._kanban('light'):
            self.open_user_menu()
            self.wait(f"!!document.querySelector('{MENU} .dropdown-divider')")
            got = self.style(f'{MENU} .dropdown-divider', 'margin-top', 'margin-bottom',
                             'border-top-width', 'border-top-color')
            self.assertEqual(got['margin-top'], '8px')
            self.assertEqual(got['margin-bottom'], '8px')
            self.assertEqual(got['border-top-width'], '1px')
            self.assertColour(got['border-top-color'], '#DEE2E6')

    def test_A7_radii_shadow_blur(self):
        for scheme in ('light', 'dark'):
            with self._kanban(scheme):
                button = '.o_control_panel .o-kanban-button-new'
                self.wait(f"!!document.querySelector('{button}')")
                self.assertEqual(
                    self.style(button, 'border-top-left-radius')['border-top-left-radius'], '6px')
                self.assertEqual(self.style(':root', '--o-cws-blur')['--o-cws-blur'], '4px')
                self.open_user_menu()
                self.assertShadow(self.style(MENU, 'box-shadow')['box-shadow'],
                                  OVERLAY_FRAME[scheme][2])
                self.assertEqual(
                    self.style(MENU, 'border-top-left-radius')['border-top-left-radius'], '12px')

    def test_A113_select_menu_padding(self):
        # the Currency many2one (autocomplete) of a Currency Rate form (res.currency.rate)
        for scheme in ('light', 'dark'):
            with self.page(self.fixtures['date_form_url'], scheme=scheme):
                field = '.o_field_many2one input'
                self.wait(f"!!document.querySelector('{field}')")
                self.js(f"document.querySelector('{field}').click()")
                menu = '.o-autocomplete--dropdown-menu'
                self.wait(f"document.querySelectorAll('{menu} .dropdown-item').length > 1")
                got = self.style(menu, 'padding-top', 'padding-bottom', 'padding-left',
                                 'padding-right')
                self.assertEqual(set(got.values()), {'4px'}, got)
                for selector in (f'{menu} .ui-menu-item', f'{menu} .dropdown-item'):
                    margins = self.style(selector, 'margin-top', 'margin-bottom')
                    self.assertEqual(set(margins.values()), {'0px'}, f'{selector} {margins}')
                self.assertFrame(menu, 12, scheme)
                # the active row of the autocomplete takes the dark hover gloss (R19)
                row = f'{menu} .ui-menu-item > a:not(.o_m2o_start_typing, .o_m2o_no_result)'
                self.js(f"document.querySelector({row!r}).classList.add('ui-state-active')")
                got = self.style(row, 'background-image')['background-image']
                if scheme == 'dark':
                    self.assertIn('gradient', got)


@tagged('post_install', '-at_install')
class TestThemePopovers(OverlayMixin, ThemeProbeCase):
    PICKER = '.o_datetime_picker'
    POPOVER = '.o_popover:has(.o_datetime_picker)'

    def _open_picker(self):
        self.wait("!!document.querySelector('.o_field_date button')")
        self.js("document.querySelector('.o_field_date button').click()")
        self.wait(f"!!document.querySelector('{self.PICKER}')")

    def test_A88_date_popover(self):
        for scheme in ('light', 'dark'):
            with self.page(self.fixtures['date_form_url'], scheme=scheme):
                self._open_picker()
                self.assertFrame(self.POPOVER, 12, scheme)
                self.assertEqual(self.style(self.POPOVER, 'font-size')['font-size'], '13px')

    def test_A114_dark_popover_contents(self):
        with self.page(self.fixtures['date_form_url'], scheme='dark'):
            self._open_picker()
            self.js(
                "document.querySelector('.o_datetime_picker').insertAdjacentHTML("
                "'beforeend', '<button class=\"btn btn-secondary o_cws_probe_btn\">x</button>"
                "<input type=\"range\" class=\"form-range o_cws_probe_range\"/>"
                "<table class=\"table o_cws_probe_table\"><tr><td>x</td></tr></table>')"
            )
            btn = '.o_cws_probe_btn'
            self.assertColour(self.style(btn, 'background-color')['background-color'], '#565762')
            with self.forced(btn, 'hover'):
                self.assertColour(
                    self.style(btn, 'background-color')['background-color'], '#626370')
            # the track and pressed-thumb colours are custom properties read by the
            # slider pseudo-elements, which getComputedStyle cannot reach
            track = self.style('.o_cws_probe_range', '--o-cws-range-track')
            self.assertColour(track['--o-cws-range-track'], '#26272C')
            self.assertColour(self._pixel('.o_cws_probe_range', .1), '#26272C')
            self._assert_pixel_aims_at_slider('.o_cws_probe_range', '#26272C')
            self.assertColour(
                self.style('.o_cws_probe_table td', 'background-color')['background-color'],
                '#3E3F47')

    def test_A122_dark_tooltip(self):
        for scheme, bg, text, border in (
            ('dark', '#3E3F47', '#EBEBEB', '#56575E'),
            ('light', '#FFFFFF', '#212529', '#DEE2E6'),
        ):
            with self.page(self.fixtures['apps_kanban_url'], scheme=scheme):
                button = '.o_control_panel .o_cp_switch_buttons .btn'
                self.wait(f"!!document.querySelector('{button}')")
                self.pointer_to(button)
                frame = '.o_popover:has(.o-tooltip)'
                self.wait(f"!!document.querySelector('{frame}')")
                got = self.style(frame, 'background-color', 'border-top-color',
                                 'border-top-width')
                self.assertColour(got['background-color'], bg)
                self.assertColour(got['border-top-color'], border)
                self.assertEqual(got['border-top-width'], '1px')
                self.assertColour(self.style('.o-tooltip', 'color')['color'], text)

    def test_A6_search_focus_border(self):
        for scheme, rest, focus, background in (
            ('light', '#CED4DA', '#68A9AF', '#FFFFFF'),
            ('dark', '#3E3F47', '#398A88', '#2C2E35'),
        ):
            with self.page(self.fixtures['apps_kanban_url'], scheme=scheme):
                bar = '.o_cp_searchview .o_searchview'
                self.wait(f"!!document.querySelector('{bar}')")
                self.js("document.activeElement && document.activeElement.blur()")
                self._settle(bar, 0)
                self.assertColour(self.style(bar, 'border-top-color')['border-top-color'], rest)
                self.assertColour(
                    self.style(bar, 'background-color')['background-color'], background)
                self.js("document.querySelector('.o_searchview_input').focus()")
                self._settle(bar, 0)
                got = self.style(bar, 'border-top-color', 'background-color')
                self.assertColour(got['border-top-color'], focus)
                self.assertColour(got['background-color'], background)


@tagged('post_install', '-at_install')
class TestThemeDialogPalette(OverlayMixin, ThemeProbeCase):
    def _open_preferences(self):
        self.open_user_menu()
        self.js("document.querySelector('[data-menu=\"preferences\"]').click()")
        self.wait("!!document.querySelector('.o_dialog .modal-content .o_form_view')")

    def test_A90_dialog_backdrop(self):
        for scheme, view_bg, line in (
            ('light', '#FFFFFF', '#000000'), ('dark', '#2C2E35', '#FFFFFF')
        ):
            with self.page(self.fixtures['apps_kanban_url'], scheme=scheme):
                self._open_preferences()
                got = self.style('.o_dialog .modal-content', 'background-color',
                                 'box-shadow', 'border-top-color')
                self.assertColour(got['background-color'], view_bg)
                self.assertShadow(got['box-shadow'], OVERLAY_FRAME[scheme][2])
                self.assertColour(got['border-top-color'], line, alpha=.175)
                backdrop = self.style('.o_dialog > .modal', 'background-color')
                self.assertColour(backdrop['background-color'], '#000000', alpha=.25)

    def test_A95_radio_in_dialog(self):
        for scheme, action, mark in (('light', '#017E84', 'fff'), ('dark', '#1CBCB1', '000')):
            with self.page(self.fixtures['apps_kanban_url'], scheme=scheme):
                self._open_preferences()
                radio = '.o_dialog .o_field_widget[name="color_scheme"] input:checked'
                self.wait(f"!!document.querySelector('{radio}')")
                got = self.style(radio, 'background-color', 'border-top-color',
                                 'background-image')
                self.assertColour(got['background-color'], action)
                self.assertColour(got['border-top-color'], action)
                self.assertMark(got['background-image'], mark)

    def test_A96_command_palette(self):
        for scheme, focus in (('light', '#E6F2F3'), ('dark', '#3B4C52')):
            with self.page(f"/odoo/action-{self.fixtures['kanban_action']}", scheme=scheme):
                self.wait("!!document.querySelector('.o_control_panel')")
                for kind in ('keyDown', 'keyUp'):
                    self.browser._websocket_request('Input.dispatchKeyEvent', params={
                        'type': kind, 'key': 'k', 'code': 'KeyK', 'modifiers': 2,
                        'windowsVirtualKeyCode': 75,
                    })
                row = '.o_command_palette .o_command.focused'
                self.wait(f"!!document.querySelector('{row}')")
                got = self.style('.o_command_palette', 'border-top-left-radius', 'box-shadow')
                self.assertEqual(got['border-top-left-radius'], '8px')
                self.assertShadow(got['box-shadow'], OVERLAY_FRAME[scheme][2])
                got = self.style(row, 'border-top-left-radius', 'background-color')
                self.assertEqual(got['border-top-left-radius'], '8px')
                self.assertColour(got['background-color'], focus, alpha=.65)
                inset = self.js(
                    "(() => { const l = document.querySelector('.o_command_palette_listbox')"
                    ".getBoundingClientRect(); const r = document.querySelector("
                    f"'{row}').getBoundingClientRect(); return r.left - l.left; }})()"
                )
                self.assertAlmostEqual(inset, 8, delta=1)


@tagged('post_install', '-at_install')
class TestThemeInputs(OverlayMixin, ThemeProbeCase):
    def test_A94_field_underline(self):
        field = '.o_field_widget[name="rate"] input'
        for scheme, hover, focus in (('light', '#E7EBED', '#017E84'),
                                     ('dark', '#3E3F47', '#1CBCB1')):
            with self.page(self.fixtures['date_form_url'], scheme=scheme):
                self.wait(f"!!document.querySelector('{field}')")
                self.js("document.activeElement && document.activeElement.blur()")
                got = self.style(field, 'border-bottom-color', 'border-bottom-width',
                                 'padding-top', 'padding-left')
                self.assertEqual(got['border-bottom-width'], '1px')
                self.assertEqual((got['padding-top'], got['padding-left']), ('1px', '0px'))
                self.assertColour(got['border-bottom-color'], '#000000', alpha=0)
                with self.forced(field, 'hover'):
                    self.assertColour(
                        self.style(field, 'border-bottom-color')['border-bottom-color'], hover)
                self.js(f"document.querySelector('{field}').focus()")
                self._settle(field, 0)
                self.assertColour(
                    self.style(field, 'border-bottom-color')['border-bottom-color'], focus)

    def test_A94_required_line(self):
        # R39: the emphasised line of a required input is the black role
        for scheme, black in (('light', '#000000'), ('dark', '#FFFFFF')):
            with self.page(self.fixtures['date_form_url'], scheme=scheme):
                self.wait("!!document.querySelector('.o_required_modifier')")
                got = self.style('.o_required_modifier', '--o-input-border-color')
                self.assertColour(got['--o-input-border-color'], black)

    def _list(self, scheme):
        return self.page(f"/odoo/action-{self.fixtures['list_action']}", scheme=scheme)

    def test_A95_checks_radios(self):
        for scheme, border, action, mark in (
            ('light', '#CED4DA', '#017E84', 'fff'), ('dark', '#56575E', '#1CBCB1', '000')
        ):
            with self._list(scheme):
                box = '.o_data_row .o_list_record_selector input'
                self.wait(f"!!document.querySelector('{box}')")
                rest = self.style(box, 'background-color', 'border-top-color')
                self.assertColour(rest['border-top-color'], border)
                self.js(f"document.querySelector('{box}').click()")
                self.wait(f"document.querySelector('{box}').checked")
                self._settle(box, 0)
                got = self.style(box, 'background-color', 'border-top-color',
                                 'background-image')
                self.assertColour(got['background-color'], action)
                self.assertColour(got['border-top-color'], action)
                self.assertIn('linear-gradient', got['background-image'])
                self.assertMark(got['background-image'], mark)

    def test_A116_focus_ring_slider_switch(self):
        with self._list('light'):
            box = '.o_data_row .o_list_record_selector input'
            self.wait(f"!!document.querySelector('{box}')")
            with self.forced(box, 'focus', 'focus-visible'):
                shadow = self.style(box, 'box-shadow')['box-shadow']
            self.assertIn('0px 0px 0px 4px', shadow)
            self.assertColour(shadow.split(') ')[0] + ')', '#017E84', alpha=.25)
        with self._list('dark'):
            self.wait("!!document.querySelector('.o_content')")
            self.js(
                "document.querySelector('.o_content').insertAdjacentHTML('beforeend',"
                " '<input type=\"range\" class=\"form-range o_cws_probe_range\"/>"
                "<div class=\"form-check form-switch\"><input type=\"checkbox\""
                " class=\"form-check-input o_cws_probe_switch\"/></div>"
                "<div class=\"form-check form-switch\"><input type=\"checkbox\" checked"
                " class=\"form-check-input o_cws_probe_switch_on\"/></div>')"
            )
            range_roles = self.style('.o_cws_probe_range', '--o-cws-range-track',
                                     '--o-cws-range-thumb-active')
            self.assertColour(range_roles['--o-cws-range-track'], '#3E3F47')
            self.assertColour(range_roles['--o-cws-range-thumb-active'], '#B2559A')
            self.assertColour(self._pixel('.o_cws_probe_range', .1), '#3E3F47')
            self._assert_pixel_aims_at_slider('.o_cws_probe_range', '#3E3F47')
            # R39 has no disabled exception: a disabled slider keeps the grey 300 track
            self.js(
                "document.querySelector('.o_content').insertAdjacentHTML('beforeend',"
                " '<input type=\"range\" disabled class=\"form-range o_cws_probe_range_off\"/>')"
            )
            self.assertColour(self._pixel('.o_cws_probe_range_off', .1), '#3E3F47')
            with self.forced('.o_cws_probe_range', 'active'):
                thumb = self._pixel('.o_cws_probe_range', .5)
            self.assertColour(thumb, '#B2559A')
            knob = self.style('.o_cws_probe_switch', 'background-image')['background-image']
            plain = knob.replace(' ', '').replace('%20', '').replace('%28', '(').replace('%29', ')')
            self.assertRegex(plain, r'rgba\(255,255,255,0?\.5\)')
            checked = self.style('.o_cws_probe_switch_on', 'background-image')['background-image']
            self.assertIn('2c2e35', checked.lower())


NAV = '.o_control_panel nav.o_cp_switch_buttons'
EASE = 'cubic-bezier(0.2, 1.12, 0.2, 1.12)'
GRAPH_MODES = '.o_switcher[aria-label="Change graph"]'
SWITCHER_COLOURS = {
    # scheme: (view background, pill, hover (hex, alpha))
    'light': ('#FFFFFF', '#E7EBED', ('#DEE2E6', .5)),
    'dark': ('#2C2E35', '#56575E', ('#3E3F47', 1.0)),
}


class SwitcherMixin:
    def pill(self, container, index=0):
        """Box of the ``::before`` highlight of ``container`` in page coordinates."""
        return self.js(f"""(() => {{
            const el = document.querySelectorAll({json.dumps(container)})[{index}];
            const cs = getComputedStyle(el, '::before');
            const r = el.getBoundingClientRect();
            const rtl = getComputedStyle(el).direction === 'rtl';
            const width = parseFloat(cs.width);
            const left = parseFloat(cs.left);
            const border = parseFloat(getComputedStyle(el).borderLeftWidth);
            return {{x: r.x + border + left, width, display: cs.display, content: cs.content,
                     rtl}};
        }})()""")

    def assertPillOn(self, container, button, delta=2):
        pill = self.pill(container)
        box = self.rect(button)
        self.assertEqual(pill['display'], 'block', container)
        self.assertAlmostEqual(pill['x'], box['x'], delta=delta, msg=f'{container} x')
        self.assertAlmostEqual(pill['width'], box['width'], delta=delta, msg=f'{container} w')

    def settled_on(self, container, button):
        """Wait until the highlight of ``container`` lies on ``button`` (slide done)."""
        self.wait(f"""(() => {{
            const el = document.querySelector({json.dumps(container)});
            const b = document.querySelector({json.dumps(button)}).getBoundingClientRect();
            const cs = getComputedStyle(el, '::before');
            const border = parseFloat(getComputedStyle(el).borderLeftWidth);
            const x = el.getBoundingClientRect().x + border + parseFloat(cs.left);
            return cs.display === 'block' && Math.abs(x - b.x) < 1
                && Math.abs(parseFloat(cs.width) - b.width) < 1
                && !el.getAnimations({{subtree: false}}).length
                && !document.getAnimations().some((a) => a.effect.pseudoElement);
        }})()""")

    def inject_switcher(self, buttons, active):
        """A ``.btn-group.o_switcher`` of ``buttons`` buttons, ``active`` (0-based, or None)."""
        self.js(f"""(() => {{
            document.querySelectorAll('.o_cws_probe_switcher').forEach((e) => e.remove());
            const group = document.createElement('div');
            group.className = 'btn-group o_switcher o_cws_probe_switcher';
            group.style.cssText = 'position: fixed; top: 300px; left: 300px; z-index: 9999';
            for (let i = 0; i < {buttons}; i++) {{
                const b = document.createElement('button');
                const on = i === {json.dumps(active)};
                b.className = 'btn btn-secondary o_cws_probe_b' + (on ? ' active' : '');
                b.textContent = 'x';
                group.append(b);
            }}
            document.body.append(group);
        }})()""")


@tagged('post_install', '-at_install')
class TestThemeSwitchers(SwitcherMixin, ThemeProbeCase):
    def _open(self, scheme='light', **kwargs):
        return self.page(self.fixtures['apps_kanban_url'], scheme=scheme, **kwargs)

    def _ready(self):
        self.wait(f"!!document.querySelector('{NAV} .o_list')")

    def test_A48_view_switcher_look(self):
        for scheme, (view_bg, pill, (hover, hover_alpha)) in SWITCHER_COLOURS.items():
            with self._open(scheme):
                self._ready()
                got = self.style(NAV, 'background-color', 'border-top-width', 'border-top-style',
                                 'padding-top', 'padding-left', 'border-top-left-radius',
                                 'column-gap')
                self.assertColour(got['background-color'], view_bg)
                self.assertEqual(
                    (got['border-top-width'], got['border-top-style']), ('1px', 'solid'))
                self.assertEqual((got['padding-top'], got['padding-left']), ('4px', '4px'))
                self.assertEqual(got['border-top-left-radius'], '10px')
                self.assertEqual(got['column-gap'], '3px')
                self.assertColour(
                    self.style(NAV, 'background-color', pseudo='::before')['background-color'],
                    pill)
                self.assertPillOn(NAV, f'{NAV} .btn.active')
                # buttons: transparent, no border, no gloss, 2px by 6px, 6px radius
                button = f'{NAV} .btn:not(.active)'
                got = self.style(button, 'background-color', 'border-top-width', 'background-image',
                                 'padding-top', 'padding-left', 'border-top-left-radius')
                self.assertColour(got['background-color'], '#000000', alpha=0)
                self.assertEqual(got['border-top-width'], '0px')
                self.assertEqual(got['background-image'], 'none')
                self.assertEqual((got['padding-top'], got['padding-left']), ('2px', '6px'))
                self.assertEqual(got['border-top-left-radius'], '6px')
                with self.forced(button, 'hover'):
                    got = self.style(button, 'background-color')
                self.assertColour(got['background-color'], hover, alpha=hover_alpha)
                with self.forced(f'{NAV} .btn.active', 'hover'):
                    got = self.style(f'{NAV} .btn.active', 'background-color')
                self.assertColour(got['background-color'], '#000000', alpha=0)

    def test_A49_pill_slide(self):
        with self._open():
            self._ready()
            self.js("""(() => {
                window.__cws_slides = [];
                document.addEventListener('animationstart', (ev) => {
                    if (ev.animationName === 'o-cws-pill-slide') {
                        window.__cws_slides.push({pseudo: ev.pseudoElement});
                    }
                }, true);
            })()""")
            self.js(f"document.querySelector('{NAV} .o_list').click()")
            self.wait(f"!!document.querySelector('{NAV} .o_list.active')")
            got = self.style(NAV, 'animation-name', 'animation-duration',
                             'animation-timing-function', pseudo='::before')
            self.assertEqual(got['animation-name'], 'o-cws-pill-slide')
            self.assertEqual(got['animation-duration'], '0.2s')
            self.assertEqual(got['animation-timing-function'], EASE)
            self.wait('window.__cws_slides.length > 0')
            self.assertEqual(self.js('window.__cws_slides[0].pseudo'), '::before')
            self.settled_on(NAV, f'{NAV} .o_list')
            self.assertPillOn(NAV, f'{NAV} .o_list.active')
            self.assertEqual(
                self.style(NAV, '--cws-switch-from', '--cws-switch-to', '--cws-switch-count'),
                {'--cws-switch-from': '0', '--cws-switch-to': '1',
                 '--cws-switch-count': str(self.js(
                     f"document.querySelectorAll('{NAV} .btn').length"))},
            )

    def test_A49_slide_starts_on_the_old_slot(self):
        with self._open():
            self._ready()
            self.js("""(() => {
                window.__cws_start = null;
                document.addEventListener('animationstart', (ev) => {
                    if (ev.animationName === 'o-cws-pill-slide') {
                        const nav = ev.target;
                        const cs = getComputedStyle(nav, '::before');
                        const run = document.getAnimations().find(
                            (a) => a.effect.pseudoElement === '::before');
                        run.pause();
                        run.currentTime = 0;
                        const kanban = nav.querySelector('.o_kanban').getBoundingClientRect();
                        window.__cws_start = {
                            dx: nav.getBoundingClientRect().x + 1 + parseFloat(cs.left) - kanban.x,
                        };
                    }
                }, true);
            })()""")
            self.js(f"document.querySelector('{NAV} .o_list').click()")
            self.wait('window.__cws_start !== null')
            self.assertAlmostEqual(self.js('window.__cws_start.dx'), 0, delta=2)

    def test_A15_reduced_motion_pill(self):
        with self._open(reduced_motion=True):
            self._ready()
            self.js(f"document.querySelector('{NAV} .o_list').click()")
            self.wait(f"!!document.querySelector('{NAV} .o_list.active')")
            got = self.style(NAV, 'animation-name', pseudo='::before')
            self.assertEqual(got['animation-name'], 'none')
            self.assertEqual(self.js("document.getAnimations().filter("
                                     "(a) => a.effect.pseudoElement).length"), 0)
            self.assertPillOn(NAV, f'{NAV} .o_list.active', delta=1)

    def test_A15_reduced_motion_graph_switcher(self):
        with self.page(f"/odoo/action-{self.fixtures['graph_action']}", reduced_motion=True):
            self.wait(f"!!document.querySelector('{GRAPH_MODES} .btn')")
            got = self.style(GRAPH_MODES, 'transition-duration', 'animation-name',
                             pseudo='::before')
            self.assertEqual(got['transition-duration'], '0s')
            self.assertEqual(got['animation-name'], 'none')

    def test_A50_graph_switcher(self):
        for scheme, (view_bg, pill, _hover) in SWITCHER_COLOURS.items():
            with self.page(f"/odoo/action-{self.fixtures['graph_action']}", scheme=scheme):
                self.wait(f"!!document.querySelector('{GRAPH_MODES} .btn.active')")
                got = self.style(GRAPH_MODES, 'background-color', 'border-top-left-radius',
                                 'padding-top')
                self.assertColour(got['background-color'], view_bg)
                self.assertEqual(got['border-top-left-radius'], '10px')
                self.assertEqual(got['padding-top'], '4px')
                self.assertColour(
                    self.style(GRAPH_MODES, 'background-color',
                               pseudo='::before')['background-color'], pill)
                self.assertPillOn(GRAPH_MODES, f'{GRAPH_MODES} .btn.active')
                for mode in ('line', 'pie', 'bar'):
                    self.js(f"document.querySelector('{GRAPH_MODES} [data-mode={mode}]').click()")
                    self.settled_on(GRAPH_MODES, f'{GRAPH_MODES} [data-mode={mode}]')
                    self.assertPillOn(GRAPH_MODES, f'{GRAPH_MODES} [data-mode={mode}].active')

    def test_A50b_one_button_and_fast_switch(self):
        with self.page(f"/odoo/action-{self.fixtures['graph_action']}"):
            self.wait(f"!!document.querySelector('{GRAPH_MODES} .btn.active')")
            # three modes in a row without waiting: the highlight ends under the last
            self.js(f"""(() => {{
                for (const mode of ['line', 'pie', 'line']) {{
                    document.querySelector('{GRAPH_MODES} [data-mode=' + mode + ']').click();
                }}
            }})()""")
            self.settled_on(GRAPH_MODES, f'{GRAPH_MODES} [data-mode=line]')
            self.assertPillOn(GRAPH_MODES, f'{GRAPH_MODES} [data-mode=line].active', delta=1)
            # a switcher of one button: the highlight covers the whole slot
            self.inject_switcher(1, 0)
            self.settled_on('.o_cws_probe_switcher', '.o_cws_probe_b')
            self.assertPillOn('.o_cws_probe_switcher', '.o_cws_probe_b')
            self.assertGreater(self.pill('.o_cws_probe_switcher')['width'], 10)

    def test_A119_no_pill(self):
        with self._open():
            self._ready()
            for count, active in ((5, 0), (3, None), (0, None)):
                self.inject_switcher(count, active)
                got = self.pill('.o_cws_probe_switcher')
                self.assertEqual((got['display'], got['content']), ('none', 'none'),
                                 (count, active))
            # the buttons keep the transparent look
            self.inject_switcher(5, 0)
            got = self.style('.o_cws_probe_b', 'background-color', 'border-top-width')
            self.assertColour(got['background-color'], '#000000', alpha=0)
            self.assertEqual(got['border-top-width'], '0px')
            # and up to four buttons with an active one do get it
            for count in (2, 4):
                self.inject_switcher(count, count - 1)
                self.assertEqual(self.pill('.o_cws_probe_switcher')['display'], 'block')

    def test_E9_rtl_mirrors_the_pill(self):
        # the logical properties follow the document direction
        with self._open():
            self._ready()
            # (the web client forces ltr in several wrappers; the rtl bundle flips them)
            self.js(f"document.querySelector('{NAV}').style.direction = 'rtl'")
            self.assertEqual(self.js("getComputedStyle(document.querySelector("
                                     f"'{NAV}')).direction"), 'rtl')
            self.assertPillOn(NAV, f'{NAV} .btn.active')


@tagged('post_install', '-at_install')
class TestThemeNotebookStatusbar(OverlayMixin, ThemeProbeCase):
    TAB = '.o_notebook .nav-link'

    def test_A46_notebook(self):
        for scheme, text, bar, inactive, hover in (
            ('light', '#714B67', '#714B67', '#F8F9FA', '#E7EBED'),
            ('dark', '#C175AD', '#C175AD', '#3E3F47', '#56575E'),
        ):
            with self.page(self.fixtures['form_record_url'], scheme=scheme):
                self.wait(f"document.querySelectorAll('{self.TAB}').length > 1")
                got = self.style(f'{self.TAB}.active', 'color', 'background-color',
                                 'border-top-left-radius', 'padding-top', 'padding-left')
                self.assertColour(got['color'], text)
                self.assertColour(got['background-color'], '#000000', alpha=0)
                self.assertEqual(got['border-top-left-radius'], '6px')
                self.assertEqual((got['padding-top'], got['padding-left']), ('8px', '16px'))
                got = self.style(f'{self.TAB}.active', 'background-color', 'height',
                                 pseudo='::before')
                self.assertColour(got['background-color'], bar)
                self.assertEqual(got['height'], '3px')
                tab = f'{self.TAB}:not(.active)'
                got = self.style(tab, 'background-color', 'border-top-left-radius')
                self.assertColour(got['background-color'], inactive)
                self.assertEqual(got['border-top-left-radius'], '6px')
                with self.forced(tab, 'hover'):
                    self.assertColour(self.style(tab, 'background-color')['background-color'],
                                      hover)
                # the second tab, once active, takes the bar
                self.js(f"document.querySelectorAll('{self.TAB}')[1].click()")
                self.wait(f"document.querySelectorAll('{self.TAB}')[1].classList.contains('active')")
                self.wait('document.getAnimations().length === 0')
                got = self.style(f'{self.TAB}.active', 'color')
                self.assertColour(got['color'], text)
                self.assertEqual(
                    self.js(f"document.querySelectorAll('{self.TAB}.active').length"), 1)

    def test_A47_dialog_notebook_edge_to_edge(self):
        with self.page(self.fixtures['apps_kanban_url']):
            self.open_user_menu()
            self.js("document.querySelector('[data-menu=\"preferences\"]').click()")
            self.wait("!!document.querySelector('.o_dialog .modal-content .o_notebook')")
            content = self.rect('.o_dialog .modal-content')
            row = self.rect('.o_dialog .modal-content .o_notebook_headers')
            self.assertAlmostEqual(row['x'], content['x'], delta=1.5)
            self.assertAlmostEqual(row['x'] + row['width'], content['x'] + content['width'],
                                   delta=1.5)

    def test_A51_status_bar(self):
        group = '.o_field_statusbar > .o_statusbar_status'
        for scheme, current, hover, pressed in (
            ('light', '#E6F2F3', '#DEE2E6', '#CED4DA'),
            ('dark', '#3B4C52', '#3E3F47', '#56575E'),
        ):
            with self.page(self.fixtures['form_record_url'], scheme=scheme):
                self.wait(f"!!document.querySelector('{group} .o_arrow_button_current')")
                got = self.style(group, 'border-top-width', 'border-top-style',
                                 'border-top-left-radius', 'padding-top', 'padding-left',
                                 'background-color')
                self.assertEqual((got['border-top-width'], got['border-top-style']),
                                 ('1px', 'solid'))
                self.assertEqual(got['border-top-left-radius'], '8px')
                self.assertEqual((got['padding-top'], got['padding-left']), ('2px', '2px'))
                self.assertColour(got['background-color'],
                                  '#FFFFFF' if scheme == 'light' else '#2C2E35')
                step = f'{group} .o_arrow_button_current'
                got = self.style(step, 'background-color', 'height', 'font-weight')
                self.assertColour(got['background-color'], current)
                self.assertEqual(got['height'], '27px')
                self.assertIn(got['font-weight'], ('500', '600'))
                clickable = (f'{group} .o_arrow_button:not(.o_arrow_button_current)'
                             ':not(.dropdown-toggle)')
                with self.forced(clickable, 'hover'):
                    self.assertColour(
                        self.style(clickable, 'background-color')['background-color'], hover)
                with self.forced(clickable, 'hover', 'active'):
                    self.assertColour(
                        self.style(clickable, 'background-color')['background-color'], pressed)

