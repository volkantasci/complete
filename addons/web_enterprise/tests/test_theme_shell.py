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
            'apps_kanban_url', 'apps_list_url', 'settings_url', 'date_form_url',
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
            (fixtures['date_form_url'], '.o_form_view .o_field_date button'),
            (fixtures['settings_url'], '.o_form_view .o_setting_box'),
        ]
        with self.page(pages[0][0]):
            for url, selector in pages:
                self.browser.navigate_to(self.base_url() + url, wait_stop=False)
                self.wait(f"!!document.querySelector({selector!r})")

    def test_date_picker_opens(self):
        with self.page(self.fixtures['date_form_url']):
            self.wait("!!document.querySelector('.o_form_view .o_field_date button')")
            self.assertFalse(self.js("!!document.querySelector('.o_datetime_picker')"))
            field = '.o_form_view .o_field_date button'
            self.pointer_to(field)
            box = self.rect(field)
            point = {'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2}
            for kind in ('mousePressed', 'mouseReleased'):
                self.browser._websocket_request('Input.dispatchMouseEvent', params={
                    'type': kind, 'button': 'left', 'clickCount': 1, **point,
                })
            self.wait("!!document.querySelector('.o_datetime_picker')")


SECTION_TOGGLE = '.o_menu_sections .dropdown-toggle'
SECTION_ENTRY = '.o_menu_sections .o_nav_entry'
BAR = '.o_main_navbar'
GRID_BUTTON = '.o_main_navbar button.o_cws_grid_button'
GRID_ICON = '.o_main_navbar .o_cws_grid_icon'
BRAND_NAME = '.o_main_navbar .o_menu_brand'
BRAND_ICON = '.o_main_navbar .o_menu_brand_icon'
USER_MENU = '.o_main_navbar .o_user_menu'

LIGHT = {
    'page': '#F8F9FA', 'text': '#212529', 'hover': '#E7EBED', 'black': '#000000',
    'open': '#E6F2F3', 'open_border': '#017E84', 'glyph': '#714B67', 'counter': '#EF4444',
}
DARK = {
    'page': '#1F1F23', 'text': '#EBEBEB', 'hover': '#3E3F47', 'black': '#FFFFFF',
    'open': '#1F3738', 'open_border': '#159087', 'glyph': '#FFFFFF', 'counter': '#CB2F2F',
}
ROLES = {'light': LIGHT, 'dark': DARK}


class ShellProbeCase(ThemeProbeCase):
    """Probe tests that run inside an application (menu with sections)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        env = cls.env
        action = lambda key: f"ir.actions.act_window,{cls.fixtures[key]}"  # noqa: E731
        menus = env['ir.ui.menu']
        root = menus.create({
            'name': 'Cws probe app',
            'action': action('kanban_action'),
            'web_icon': 'base,static/description/icon.png',
        })
        section = menus.create({'name': 'Cws probe one', 'parent_id': root.id})
        menus.create({
            'name': 'Cws probe leaf', 'parent_id': section.id,
            'action': action('list_action'),
        })
        menus.create({
            'name': 'Cws probe two', 'parent_id': root.id,
            'action': action('calendar_action'),
        })
        cls.app_url = f"/odoo/action-{cls.fixtures['kanban_action']}"

    def app_page(self, scheme='light', **kwargs):
        return self.page(self.app_url, scheme=scheme, **kwargs)

    def wait_app(self):
        self.wait(f"!!document.querySelector('{SECTION_ENTRY}') && "
                  f"!!document.querySelector('{BRAND_ICON}') && "
                  "!!document.querySelector('.o_kanban_view .o_kanban_record')")
        # let the start-up transitions end
        self.js("new Promise((resolve) => setTimeout(resolve, 700))")

    def mail_installed(self):
        return bool(self.env['ir.module.module'].search_count(
            [('name', '=', 'mail'), ('state', '=', 'installed')]))


@tagged('post_install', '-at_install')
class TestThemeShell(ShellProbeCase):
    def _top_bar(self, scheme):
        roles = ROLES[scheme]
        with self.app_page(scheme):
            self.wait_app()
            bar = self.style(
                BAR, 'height', 'padding-top', 'padding-bottom', 'background-color',
                'border-bottom-width',
            )
            self.assertEqual(bar['height'], '46px')
            self.assertEqual(bar['padding-top'], '10px')
            self.assertEqual(bar['padding-bottom'], '10px')
            self.assertEqual(bar['border-bottom-width'], '0px')
            background = parse_colour(bar['background-color'])
            if background[3] > 0:  # not transparent: it is the page colour
                self.assertColour(bar['background-color'], roles['page'])
            self.assertColour(
                self.style('body', 'background-color')['background-color'], roles['page'])
            for selector in (SECTION_TOGGLE, SECTION_ENTRY):
                entry = self.style(
                    selector, 'color', 'height', 'padding-left', 'padding-right',
                    'margin-left', 'margin-right', 'border-radius', 'font-size',
                )
                self.assertColour(entry['color'], roles['text'])
                self.assertEqual(entry['height'], '26px')
                self.assertEqual(entry['padding-left'], '8px')
                self.assertEqual(entry['padding-right'], '8px')
                self.assertEqual(entry['margin-left'], '1px')
                self.assertEqual(entry['margin-right'], '1px')
                self.assertEqual(entry['border-radius'], '6px')
                self.assertEqual(entry['font-size'], '14px')
            name = self.style(BRAND_NAME, 'font-size', 'color')
            self.assertEqual(name['font-size'], '16.8px')
            self.assertColour(name['color'], roles['text'])

    def test_A10_top_bar_light(self):
        self._top_bar('light')

    def test_A10_top_bar_dark(self):
        self._top_bar('dark')

    def _entry_states(self, scheme):
        roles = ROLES[scheme]
        with self.app_page(scheme):
            self.wait_app()
            for selector in (SECTION_ENTRY, SECTION_TOGGLE):
                for states in (('hover',), ('focus', 'focus-visible')):
                    with self.forced(selector, *states):
                        got = self.style(selector, 'background-color', 'color')
                        self.assertColour(got['background-color'], roles['hover'])
                        self.assertColour(got['color'], roles['black'])

    def test_A11_entry_states_light(self):
        self._entry_states('light')

    def test_A11_entry_states_dark(self):
        self._entry_states('dark')

    def _open_entry(self, scheme, toggle, then_open):
        roles = ROLES[scheme]
        with self.app_page(scheme):
            self.wait_app()
            self.js(f"document.querySelector({toggle!r}).click()")
            self.wait(then_open)
            got = self.style(toggle, 'background-color', 'border-top-color', 'color')
            self.assertColour(got['background-color'], roles['open'])
            self.assertColour(got['border-top-color'], roles['open_border'])
            self.assertColour(got['color'], roles['black'])

    def test_A6_open_entry_light(self):
        self._open_entry('light', SECTION_TOGGLE, "!!document.querySelector('.o-dropdown--menu')")

    def test_A6_open_entry_dark(self):
        self._open_entry('dark', SECTION_TOGGLE, "!!document.querySelector('.o-dropdown--menu')")

    def test_A100_user_menu_open_light(self):
        self._open_entry('light', USER_MENU, "!!document.querySelector('.o-dropdown--menu')")

    def test_A100_user_menu_open_dark(self):
        self._open_entry('dark', USER_MENU, "!!document.querySelector('.o-dropdown--menu')")

    def _glyph(self, scheme):
        roles = ROLES[scheme]
        with self.app_page(scheme):
            self.wait_app()
            self.assertColour(self.style(GRID_ICON, 'color')['color'], roles['glyph'])
            with self.forced(GRID_BUTTON, 'hover'):
                self.assertColour(self.style(GRID_ICON, 'color')['color'], roles['black'])
            # under the real pointer
            self.pointer_to(GRID_BUTTON)
            self.wait(f"document.querySelector('{GRID_BUTTON}').matches(':hover')")
            self.assertColour(self.style(GRID_ICON, 'color')['color'], roles['black'])

    def test_A13_grid_glyph_light(self):
        self._glyph('light')

    def test_A13_grid_glyph_dark(self):
        self._glyph('dark')

    def _hover_state(self):
        with self.forced(GRID_BUTTON, 'hover'):
            self.js("new Promise((resolve) => setTimeout(resolve, 600))")
            return {
                'glyph': self.style(GRID_ICON, 'opacity', 'transform', 'color'),
                'name': self.style(BRAND_NAME, 'transform'),
                'icon': self.style(BRAND_ICON, 'opacity', 'transform'),
            }

    def test_A14_grid_hover_morph(self):
        with self.app_page():
            self.wait_app()
            rest = {
                'glyph': self.style(GRID_ICON, 'opacity'),
                'icon': self.style(BRAND_ICON, 'opacity'),
            }
            self.assertEqual(rest['glyph']['opacity'], '0')
            self.assertEqual(rest['icon']['opacity'], '1')
            durations = {
                'glyph': self.style(GRID_ICON, 'transition-duration')['transition-duration'],
                'icon': self.style(BRAND_ICON, 'transition-duration')['transition-duration'],
                'name': self.style(BRAND_NAME, 'transition-duration')['transition-duration'],
            }
            self.assertIn('0.3s', durations['glyph'])
            self.assertIn('0.2s', durations['icon'])
            self.assertIn('0.4s', durations['name'])
            hovered = self._hover_state()
            self.assertEqual(hovered['glyph']['opacity'], '1')
            self.assertEqual(hovered['icon']['opacity'], '0')
            # the name moves 8 px to the left
            self.assertIn('-8', hovered['name']['transform'])

    def test_A15_reduced_motion_grid(self):
        with self.app_page(reduced_motion=True):
            self.wait_app()
            for selector in (GRID_ICON, BRAND_ICON, BRAND_NAME):
                self.assertEqual(
                    self.style(selector, 'transition-duration')['transition-duration'], '0s',
                    f'{selector} still transitions',
                )
            reduced = self._hover_state()
        with self.app_page():
            self.wait_app()
            moving = self._hover_state()
        self.assertEqual(reduced, moving)

    def _back_chevron(self, scheme):
        roles = ROLES[scheme]
        with self.app_page(scheme):
            self.wait_app()
            self.js(f"document.querySelector({GRID_BUTTON!r}).click()")
            try:
                self.wait("document.body.classList.contains('o_home_menu_background')"
                          f" && !!document.querySelector('{GRID_BUTTON}.o_menu_toggle_back')",
                          timeout=10)
            except AssertionError:
                self.fail(self.js(
                    "document.body.className + ' || ' + "
                    "document.querySelector('.o_main_navbar').outerHTML.slice(0, 1500)"))
            self.browser._websocket_request('Input.dispatchMouseEvent', params={
                'type': 'mouseMoved', 'x': 800, 'y': 600,
            })
            self.js("new Promise((resolve) => setTimeout(resolve, 700))")
            button = self.style(
                GRID_BUTTON, 'background-color', 'background-image', 'color',
            )
            self.assertEqual(parse_colour(button['background-color'])[3], 0)
            self.assertEqual(button['background-image'], 'none')
            box = self.rect(GRID_BUTTON)
            self.assertAlmostEqual(box['width'], 38, delta=1)
            self.assertEqual(box['height'], 26)
            icon = self.style(GRID_ICON, 'color', 'transform', 'opacity')
            self.assertEqual(icon['transform'], 'matrix(-1, 0, 0, 1, 0, 0)')
            self.assertEqual(icon['opacity'], '1')
            self.assertColour(icon['color'], roles['glyph'])
            self.assertNotEqual(icon['color'], self.style('body', 'color')['color'])
            # one chevron, no dots
            self.assertEqual(self.js(
                f"getComputedStyle(document.querySelector('{GRID_ICON} .o_cws_dots')).opacity"),
                '0')
            self.assertEqual(self.js(
                f"getComputedStyle(document.querySelector('{GRID_ICON} .o_cws_chevron')).opacity"),
                '1')
            with self.forced(GRID_BUTTON, 'hover'):
                self.assertColour(self.style(GRID_ICON, 'color')['color'], roles['black'])
                self.assertEqual(
                    self.style(GRID_BUTTON, 'background-image')['background-image'], 'none')
                fill = self.style(GRID_BUTTON, 'background-color')['background-color']
                self.assertEqual(parse_colour(fill)[3], 0)

    def test_A16_A123_back_chevron_light(self):
        self._back_chevron('light')

    def test_A16_A123_back_chevron_dark(self):
        self._back_chevron('dark')

    def _counter(self, scheme, home):
        if not self.mail_installed():
            self.skipTest('the tray counters belong to the mail module')
        roles = ROLES[scheme]
        with self.app_page(scheme):
            self.wait_app()
            if home:
                self.js(f"document.querySelector({GRID_BUTTON!r}).click()")
                self.wait("document.body.classList.contains('o_home_menu_background')")
            # a counter as the mail tray draws it
            self.js("""(() => {
                const entry = document.querySelector('.o_main_navbar .o_menu_systray button');
                const badge = document.createElement('span');
                badge.className = 'o_cws_probe_counter badge rounded-pill';
                badge.textContent = '3';
                entry.appendChild(badge);
            })()""")
            got = self.style(
                '.o_cws_probe_counter', 'background-color', 'color', 'font-size',
                'font-weight', 'padding-top', 'padding-left', 'border-top-left-radius',
                'text-shadow',
            )
            self.assertColour(got['background-color'], roles['counter'])
            self.assertColour(got['color'], '#FFFFFF')
            self.assertEqual(got['font-size'], '9.8px')
            self.assertEqual(got['font-weight'], '500')
            self.assertEqual(got['padding-top'], '2px')
            self.assertEqual(got['padding-left'], '4px')
            self.assertEqual(got['text-shadow'], 'none')
            self.assertGreaterEqual(float(got['border-top-left-radius'][:-2]), 9.8)

    def test_A29_tray_counter_light_app(self):
        self._counter('light', home=False)

    def test_A29_tray_counter_dark_app(self):
        self._counter('dark', home=False)

    def test_A29_tray_counter_light_home(self):
        self._counter('light', home=True)

    def test_A29_tray_counter_dark_home(self):
        self._counter('dark', home=True)

    def test_A112_avatar_and_superuser(self):
        with self.app_page():
            self.wait_app()
            self.assertTrue(self.js(f"!!document.querySelector('{USER_MENU}')"))
            bar = self.rect(BAR)
            entry = self.rect(USER_MENU)
            got = self.style(USER_MENU, 'height', 'margin-top', 'margin-bottom')
            self.assertLess(float(got['margin-top'][:-2]), 0)
            self.assertLess(float(got['margin-bottom'][:-2]), 0)
            # the avatar entry is centred in the bar and spans the bar's inner height
            self.assertAlmostEqual(
                entry['y'] + entry['height'] / 2, bar['y'] + bar['height'] / 2, delta=1)
            self.assertGreaterEqual(entry['height'], 26)
            before = self.rect('.o_main_navbar .o_menu_systray')
            self.js("document.body.classList.add('o_is_superuser')")
            after = self.rect('.o_main_navbar .o_menu_systray')
            self.assertEqual(before['width'], after['width'])
            self.assertEqual(before['height'], after['height'])
            marker = self.style('.o_main_navbar .o_menu_systray', 'border-top-width',
                                'border-left-width')
            self.assertEqual(marker['border-top-width'], '0px')
            self.assertEqual(marker['border-left-width'], '0px')
            drawn = self.style('.o_main_navbar .o_menu_systray', 'background-image',
                               pseudo='::after')
            self.assertIn('repeating-linear-gradient', drawn['background-image'])

    def test_A9_role_usage_shell(self):
        with self.app_page():
            self.wait_app()
            self.assertColour(self.style(BAR, 'background-color')['background-color'],
                              '#000000', alpha=0)
            self.assertColour(self.style(GRID_ICON, 'color')['color'], '#714B67')
            link = self.js("""(() => {
                const a = document.createElement('a');
                a.className = 'o_cws_probe_link';
                a.href = '#';
                document.querySelector('.o_action_manager').appendChild(a);
                return getComputedStyle(a).color;
            })()""")
            self.assertColour(link, '#017E84')
            self.assertNotEqual(parse_colour(link)[:3], parse_colour('#714B67')[:3])
