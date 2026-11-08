# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Probe tests of the component look: buttons, badges, tags, ribbons (001b R16-R18, R41)."""
import re

from odoo.tests import tagged

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

    def test_A39_card_badges(self):
        with self.page(f"/odoo/action-{self.fixtures['kanban_action']}"):
            selector = '.o_kanban_record .badge.text-bg-primary'
            self.wait(f"!!document.querySelector('{selector}')")
            got = self.style(selector, 'font-size', 'font-weight', 'line-height',
                             'border-top-left-radius', 'padding-left')
            # 0.77 em of the card text (13 px on a styled card, so 10 px there)
            parent = self.js(
                f"parseFloat(getComputedStyle(document.querySelector('{selector}')"
                ".parentElement).fontSize)")
            self.assertAlmostEqual(float(got['font-size'][:-2]), .77 * parent, delta=.2)
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
