# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""R17: the home menu inside the iOS app (application list) and elsewhere (grid)."""
from odoo.tests import tagged

from .theme_probe import ThemeProbeCase, parse_colour

# the browser identification markers of the native apps, copied here on purpose:
# this module does not depend on the mobile one
UA_IOS = (
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
    '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1 OdooMobile (iOS)'
)
UA_ANDROID = (
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/126.0.0.0 Mobile Safari/537.36 OdooMobile Android'
)
PHONE = (390, 844)
DESKTOP = (1600, 900)

LIST = '.o_home_menu .o_apps'
ROW = '.o_home_menu .o_apps .o_app'
ICON = f'{ROW} .o_app_icon'
NAME = f'{ROW} .o_caption'
NAME_COLOUR = {'light': (33, 37, 41), 'dark': (255, 255, 255)}


@tagged('post_install', '-at_install')
class TestIosList(ThemeProbeCase):
    def home(self, scheme, ua, size=PHONE, touch=True):
        return self.page('/odoo', scheme=scheme, size=size, touch=touch, ua=ua)

    def wait_home(self):
        self.wait(f"document.querySelectorAll('{ROW}').length >= 2")
        # let the start-up transitions end
        self.js("new Promise((resolve) => setTimeout(resolve, 700))")

    def num(self, selector, *props, index=0):
        return {k: float(v[:-2] if v.endswith('px') else v)
                for k, v in self.style(selector, *props, index=index).items()}

    def assertNum(self, got, want, delta=0.5):
        for key, value in want.items():
            self.assertAlmostEqual(got[key], value, delta=delta, msg=key)

    def assertRgb(self, css, want, alpha=1.0):
        got = parse_colour(css)
        for g, w in zip(got[:3], want, strict=True):
            self.assertLessEqual(abs(g - w), 1, css)
        self.assertLessEqual(abs(got[3] - alpha), 0.01, css)

    def _ios_list(self, scheme):
        with self.home(scheme, UA_IOS):
            self.wait_home()
            # M1
            lst = self.style(LIST, 'display', 'flex-direction', 'row-gap', 'column-gap')
            self.assertEqual(lst['display'], 'flex')
            self.assertEqual(lst['flex-direction'], 'column')
            self.assertEqual((lst['row-gap'], lst['column-gap']), ('normal', 'normal'))
            self.assertNum(self.num(LIST, 'font-size', 'margin-top', 'margin-bottom',
                                    'margin-left', 'margin-right', 'padding-top',
                                    'padding-right', 'padding-bottom', 'padding-left'), {
                'font-size': 20, 'margin-top': 4, 'margin-bottom': 0, 'margin-left': 0,
                'margin-right': 0, 'padding-top': 0, 'padding-right': 8,
                'padding-bottom': 0, 'padding-left': 8})
            self.assertNum(self.rect(LIST), {'x': 16, 'width': 358}, delta=1)
            # the page as loaded on touch (scrolled by the field): the list's top is at 65
            # (light) / 67 (dark, the field is 2 px taller), and so is the first row's
            top = {'light': 65, 'dark': 67}[scheme]
            self.assertNum(self.rect(LIST), {'y': top}, delta=1)
            self.assertNum(self.rect(ROW), {'y': top}, delta=1)
            # M2
            row = self.style(
                ROW, 'flex-direction', 'justify-content', 'align-items', 'box-shadow',
                'background-color', 'border-top-style', 'border-right-style',
                'border-bottom-style', 'border-left-style')
            self.assertEqual(
                (row['flex-direction'], row['justify-content'], row['align-items']),
                ('row', 'normal', 'center'))
            self.assertEqual(row['box-shadow'], 'none')
            for side in ('top', 'right', 'bottom', 'left'):
                self.assertEqual(row[f'border-{side}-style'], 'none')
            self.assertRgb(row['background-color'], (255, 255, 255), 0.1)
            self.assertNum(self.num(
                ROW, 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
                'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                'border-top-width', 'border-right-width', 'border-bottom-width',
                'border-left-width', 'border-top-left-radius', 'border-top-right-radius',
                'border-bottom-right-radius', 'border-bottom-left-radius'), {
                'margin-top': 0, 'margin-right': 0, 'margin-bottom': 0, 'margin-left': 0,
                'padding-top': 16, 'padding-right': 24, 'padding-bottom': 16,
                'padding-left': 24, 'border-top-width': 0, 'border-right-width': 0,
                'border-bottom-width': 0, 'border-left-width': 0,
                'border-top-left-radius': 12, 'border-top-right-radius': 12,
                'border-bottom-right-radius': 12, 'border-bottom-left-radius': 12})
            first, second = self.rect(ROW), self.rect(ROW, 1)
            self.assertNum(first, {'x': 24, 'width': 342, 'height': 84.5}, delta=1)
            # M3: spacing, not absolute position
            self.assertAlmostEqual(second['y'] - first['y'] - first['height'], 16, delta=1)
            self.assertNum(second, {'x': 24, 'width': 342, 'height': 84.5}, delta=1)
            # M4
            self.assertNum(self.num(
                ICON, 'width', 'height', 'margin-top', 'margin-right', 'margin-bottom',
                'margin-left', 'border-top-left-radius'), {
                'width': 52.5, 'height': 52.5, 'margin-top': 0, 'margin-right': 24,
                'margin-bottom': 0, 'margin-left': 0, 'border-top-left-radius': 8})
            self.assertNum(self.rect(ICON), {'x': 48, 'width': 52.5, 'height': 52.5}, delta=1)
            # M5
            name = self.style(NAME, 'font-style', 'letter-spacing', 'text-transform',
                              'text-align', 'color')
            self.assertEqual(
                (name['font-style'], name['letter-spacing'], name['text-transform'],
                 name['text-align']), ('normal', 'normal', 'none', 'start'))
            self.assertRgb(name['color'], NAME_COLOUR[scheme])
            self.assertNum(self.num(NAME, 'font-size', 'font-weight', 'line-height'),
                           {'font-size': 20, 'font-weight': 500, 'line-height': 30})
            self.assertNum(self.rect(NAME), {'x': 124.5, 'width': 217.5, 'height': 30},
                           delta=1)

    def test_A42_ios_list_light(self):
        self._ios_list('light')

    def test_A43_ios_list_dark(self):
        self._ios_list('dark')

    def _tile(self, scheme, ua, size, touch, name_px):
        with self.home(scheme, ua, size, touch):
            self.wait_home()
            self.assertEqual(self.style(LIST, 'display')['display'], 'grid')
            row = self.style(ROW, 'flex-direction', 'background-color')
            self.assertEqual(row['flex-direction'], 'column')
            self.assertRgb(row['background-color'], (0, 0, 0), 0)
            self.assertNum(self.num(ROW, 'padding-top', 'padding-right', 'padding-bottom',
                                    'padding-left'),
                           {'padding-top': 8, 'padding-right': 8, 'padding-bottom': 8,
                            'padding-left': 8})
            name = self.style(NAME, 'font-size', 'font-weight', 'text-align')
            self.assertEqual(
                (name['font-size'], name['font-weight'], name['text-align']),
                (f'{name_px}px', '500', 'center'))
            return self.rect(ROW)

    def _marker_desktop(self, scheme):
        box = self._tile(scheme, UA_IOS, DESKTOP, False, 14)
        # M6 sizes (the position depends on the window)
        self.assertAlmostEqual(box['width'], 141.656, delta=1)
        self.assertAlmostEqual(box['height'], 115, delta=1)

    def test_A44_ios_marker_desktop_light(self):
        self._marker_desktop('light')

    def test_A44_ios_marker_desktop_dark(self):
        self._marker_desktop('dark')

    def test_A45_android_phone_grid(self):
        for scheme in ('light', 'dark'):
            self._tile(scheme, UA_ANDROID, PHONE, True, 13)

    def test_A45_normal_phone_grid(self):
        for scheme in ('light', 'dark'):
            self._tile(scheme, None, PHONE, True, 13)

    def test_A46_marker_without_host(self):
        # the pages of this class never install a host object: the marker alone decides
        with self.home('light', UA_IOS):
            self.wait_home()
            self.assertFalse(self.js("'OdooDeviceUtility' in window"))
            self.assertEqual(self.style(LIST, 'display')['display'], 'flex')
            self.assertEqual(self.style(ROW, 'flex-direction')['flex-direction'], 'row')
