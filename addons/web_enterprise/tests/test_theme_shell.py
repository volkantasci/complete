# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests import tagged

from .theme_probe import ThemeProbeCase, parse_colour

PRIMARY_BUTTON = '.o_control_panel .o-kanban-button-new'


@tagged('post_install', '-at_install')
class TestThemeProbe(ThemeProbeCase):
    def test_colour_parsing(self):
        self.assertColour('rgb(113, 75, 103)', '#714B67')
        self.assertColour('rgba(0, 0, 0, 0.5)', '#000000', alpha=0.5)
        self.assertColour('color(srgb 0.4431 0.2941 0.4039)', '#714B67')
        self.assertColour('rgb(114 76 104)', '#714B67')
        self.assertColour('rgba(255, 255, 255, 0.25)', '#FFFFFF40')
        self.assertEqual(parse_colour('#fff'), (255, 255, 255, 1.0))
        with self.assertRaises(AssertionError):
            self.assertColour('rgb(0, 0, 0)', '#714B67')
        with self.assertRaises(AssertionError):
            self.assertColour('rgba(113, 75, 103, 0.5)', '#714B67')
        with self.assertRaises(ValueError):
            parse_colour('transparent')


@tagged('post_install', '-at_install')
class TestThemePageRoles(ThemeProbeCase):
    def _page_roles(self, scheme, background, text, primary, primary_text=None):
        url = f"/odoo/action-{self.fixtures['kanban_action']}"
        with self.page(url, scheme=scheme):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            page = self.style('body', 'background-color')
            self.assertColour(page['background-color'], background)
            body = self.style('body', 'color', 'font-size', 'line-height')
            self.assertColour(body['color'], text)
            self.assertEqual(body['font-size'], '14px')
            self.assertEqual(body['line-height'], '21px')
            button = self.style(PRIMARY_BUTTON, 'background-color', 'color')
            self.assertColour(button['background-color'], primary)
            if primary_text:
                self.assertColour(button['color'], primary_text)

    def test_A2_light_page_roles(self):
        self._page_roles('light', '#F8F9FA', '#212529', '#714B67', '#FFFFFF')

    def test_A3_dark_page_roles(self):
        self._page_roles('dark', '#1F1F23', '#EBEBEB', '#92427D')


@tagged('post_install', '-at_install')
class TestThemeProbeTools(ThemeProbeCase):
    def test_probe_tools(self):
        url = f"/odoo/action-{self.fixtures['kanban_action']}"
        with self.page(url, size=(1200, 800), touch=True, reduced_motion=True):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.assertEqual(self.js('innerWidth'), 1200)
            self.assertTrue(self.js("matchMedia('(prefers-reduced-motion: reduce)').matches"))
            self.assertTrue(self.js("'ontouchstart' in window"))
            self.assertGreater(self.rect(PRIMARY_BUTTON)['width'], 20)
            rest = self.style(PRIMARY_BUTTON, 'background-color')['background-color']
            with self.forced(PRIMARY_BUTTON, 'hover'):
                hovered = self.style(PRIMARY_BUTTON, 'background-color')['background-color']
            self.assertNotEqual(rest, hovered)
            after = self.style(PRIMARY_BUTTON, 'background-color')['background-color']
            self.assertEqual(after, rest)
            self.pointer_to('.o_kanban_record')
            self.assertTrue(self.js("document.querySelector('.o_kanban_record').matches(':hover')"))
            self.js("document.activeElement.blur()")
            self.key('Tab')
            self.assertNotEqual(self.js('document.activeElement.tagName'), 'BODY')

    def test_fixture_shapes(self):
        fixtures = self.fixtures
        for key in (
            'kanban_action', 'kanban_ungrouped_action', 'list_action', 'list_grouped_action',
            'calendar_action', 'pivot_action', 'graph_action', 'form_record_url',
            'apps_kanban_url', 'apps_list_url', 'settings_url',
        ):
            self.assertIn(key, fixtures)
        with self.page(f"/odoo/action-{fixtures['kanban_action']}", scheme='dark'):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            counts = self.js(
                "[...document.querySelectorAll('.o_kanban_group')]"
                ".map((g) => g.querySelectorAll('.o_kanban_record').length)"
            )
            self.assertGreaterEqual(max(counts), 3)
            self.assertIn(1, counts)
            self.assertTrue(self.js("!!document.querySelector('.o_kanban_group .progress')"))
            self.assertTrue(self.js("!!document.querySelector('.o_kanban_record .o_tag')"))

    def test_fixture_pages_load(self):
        fixtures = self.fixtures
        pages = [
            (
                f"/odoo/action-{fixtures['kanban_ungrouped_action']}",
                '.o_kanban_view .o_kanban_record',
            ),
            (f"/odoo/action-{fixtures['list_action']}", '.o_list_view .o_data_row'),
            (f"/odoo/action-{fixtures['list_grouped_action']}", '.o_list_view .o_group_header'),
            (fixtures['form_record_url'], '.o_form_view .o_notebook'),
            (f"/odoo/action-{fixtures['calendar_action']}", '.o_calendar_view'),
            (f"/odoo/action-{fixtures['pivot_action']}", '.o_pivot table'),
            (f"/odoo/action-{fixtures['graph_action']}", '.o_graph_canvas_container canvas'),
            (fixtures['apps_kanban_url'], '.o_kanban_view .o_kanban_record'),
            (fixtures['apps_list_url'], '.o_list_view .o_data_row'),
            (fixtures['settings_url'], '.o_form_view .o_setting_box'),
        ]
        with self.page(pages[0][0]):
            for url, selector in pages:
                self.browser.navigate_to(self.base_url() + url, wait_stop=False)
                self.wait(f"!!document.querySelector({selector!r})")
