# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import re
from unittest.mock import patch

from odoo.http.session import session_store
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

    def test_session_file_written_again(self):
        # SessionStore.save swallows OSError; the harness must notice a missing file
        # and write it again, so that the first load is signed in.
        store = session_store()
        real_save = store.save
        calls = []

        def lossy_save(session):
            calls.append(session.sid)
            if len(calls) > 1:
                real_save(session)

        url = f"/odoo/action-{self.fixtures['kanban_action']}"
        with patch.object(store, 'save', side_effect=lossy_save), \
                self.assertLogs('odoo.addons.web_enterprise.tests.theme_probe', 'WARNING'), \
                self.page(url):
            self.wait("!!document.querySelector('.o_kanban_view')")
        self.assertGreater(len(calls), 1)

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


COUNTER = '.o_main_navbar .o-mail-MessagingMenuInDropdown-counter'
COUNTER_ICON = (
    '.o_main_navbar .o_menu_systray button:has(> .o-mail-MessagingMenuInDropdown-counter) > i'
)
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
            if scheme == 'light':  # transparent: the page shows through
                self.assertColour(bar['background-color'], '#000000', alpha=0)
            else:  # opaque page colour
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

    def _brand_geometry(self, scheme):
        # the application icon: 26 px box, painted from x 13 (S5, S6); the name stays at x 47
        with self.app_page(scheme):
            self.wait_app()
            icon = self.rect(BRAND_ICON)
            self.assertAlmostEqual(icon['x'], 13, delta=1.5)
            self.assertAlmostEqual(icon['width'], 26, delta=1)
            self.assertAlmostEqual(icon['height'], 26, delta=1)
            self.assertAlmostEqual(icon['y'] + icon['height'] / 2, 23, delta=1.5)
            self.assertAlmostEqual(self.rect(BRAND_NAME)['x'], 47, delta=1.5)
            # hovered: the chevron (6 by 12 on its path, 8 by 14 painted) is centred on x 25
            with self.forced(GRID_BUTTON, 'hover'):
                self.js("new Promise((resolve) => setTimeout(resolve, 600))")
                chevron = self.rect(f'{GRID_ICON} .o_cws_chevron')
                self.assertAlmostEqual(chevron['x'] + chevron['width'] / 2, 25, delta=1.5)
                self.assertAlmostEqual(chevron['width'], 6, delta=1)
                self.assertAlmostEqual(chevron['height'], 12, delta=1)
                self.assertAlmostEqual(chevron['y'] + chevron['height'] / 2, 23, delta=1.5)
                self.assertAlmostEqual(self.rect(BRAND_NAME)['x'], 39, delta=1.5)

    def test_A14_brand_geometry_light(self):
        self._brand_geometry('light')

    def test_A14_brand_geometry_dark(self):
        self._brand_geometry('dark')

    def _back_chevron_geometry(self, scheme):
        # S8: the back chevron button is 38 by 26 and its painted chevron is centred on x 28
        with self.app_page(scheme):
            self.wait_app()
            self.js(f"document.querySelector({GRID_BUTTON!r}).click()")
            self.wait("document.body.classList.contains('o_home_menu_background')"
                      f" && !!document.querySelector('{GRID_BUTTON}.o_menu_toggle_back')")
            self.js("new Promise((resolve) => setTimeout(resolve, 700))")
            chevron = self.rect(f'{GRID_ICON} .o_cws_chevron')
            self.assertAlmostEqual(chevron['x'] + chevron['width'] / 2, 28, delta=2)
            self.assertAlmostEqual(chevron['width'], 6, delta=1)
            self.assertAlmostEqual(chevron['height'], 12, delta=1)
            self.assertAlmostEqual(chevron['y'] + chevron['height'] / 2, 23, delta=1.5)

    def test_R8_back_chevron_geometry_light(self):
        self._back_chevron_geometry('light')

    def test_R8_back_chevron_geometry_dark(self):
        self._back_chevron_geometry('dark')

    def _mobile_toggle(self, scheme):
        roles = ROLES[scheme]
        with self.app_page(scheme, size=MOBILE, touch=True):
            self.wait("!!document.querySelector('.o_main_navbar a.o_menu_toggle')")
            self.js("new Promise((resolve) => setTimeout(resolve, 700))")
            toggle = '.o_main_navbar a.o_menu_toggle'
            self.assertColour(self.style(toggle, 'color')['color'], roles['glyph'])
            self.assertColour(self.style(f'{toggle} .oi', 'color')['color'], roles['glyph'])
            self.assertNotEqual(
                self.style(toggle, 'color')['color'], self.style('body', 'color')['color'])

    def test_R7_mobile_sidebar_toggle_light(self):
        self._mobile_toggle('light')

    def test_R7_mobile_sidebar_toggle_dark(self):
        self._mobile_toggle('dark')

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
        # one unread inbox message for the admin, created here so the counter does not depend on
        # install data
        admin = self.env.ref('base.user_admin')
        message = self.env['mail.message'].create({
            'model': 'res.partner', 'res_id': admin.partner_id.id, 'message_type': 'comment',
            'body': 'Counter probe', 'author_id': self.env.ref('base.partner_root').id,
        })
        self.env['mail.notification'].create({
            'mail_message_id': message.id, 'res_partner_id': admin.partner_id.id,
            'notification_type': 'inbox', 'is_read': False, 'notification_status': 'sent',
        })
        with self.app_page(scheme):
            self.wait_app()
            if home:
                self.js(f"document.querySelector({GRID_BUTTON!r}).click()")
                self.wait("document.body.classList.contains('o_home_menu_background')")
            # the unread counter the mail messaging menu really draws
            self.wait(f"!!document.querySelector('{COUNTER}')", timeout=60)
            got = self.style(
                COUNTER, 'background-color', 'color', 'font-size', 'font-weight',
                'padding-top', 'padding-left', 'padding-right', 'border-top-left-radius',
                'text-shadow', 'background-image',
            )
            self.assertIn('gradient', got['background-image'])
            icon = self.rect(COUNTER_ICON)
            badge = self.rect(COUNTER)
            self.assertLess(badge['y'], icon['y'])  # up
            self.assertGreater(badge['x'] + badge['width'], icon['x'] + icon['width'])  # right
            self.assertColour(got['background-color'], roles['counter'])
            self.assertColour(got['color'], '#FFFFFF')
            self.assertEqual(got['font-size'], '9.8px')
            self.assertEqual(got['font-weight'], '500')
            self.assertEqual(got['padding-top'], '2px')
            self.assertEqual(got['padding-left'], '4px')
            self.assertEqual(got['padding-right'], '4px')
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
            if self.mail_installed():
                self.wait(f"!!document.querySelector('{COUNTER}')", timeout=60)
                self.assertColour(
                    self.style(COUNTER, 'background-color')['background-color'], '#EF4444')
            link = self.js("""(() => {
                const a = document.createElement('a');
                a.className = 'o_cws_probe_link';
                a.href = '#';
                document.querySelector('.o_action_manager').appendChild(a);
                return getComputedStyle(a).color;
            })()""")
            self.assertColour(link, '#017E84')
            self.assertNotEqual(parse_colour(link)[:3], parse_colour('#714B67')[:3])


TILE = '.o_home_menu .o_app'
TILE_ICON = '.o_home_menu .o_app .o_app_icon'
TILE_NAME = '.o_home_menu .o_app .o_caption'
MOBILE = (390, 844)
COLOUR_FN = r'rgba?\(([^)]*)\)'


def split_top_level(value):
    """Split a CSS value at the commas that are not inside parentheses."""
    parts, depth, current = [], 0, ''
    for char in value:
        if char == '(':
            depth += 1
        elif char == ')':
            depth -= 1
        if char == ',' and depth == 0:
            parts.append(current.strip())
            current = ''
        else:
            current += char
    parts.append(current.strip())
    return parts


def numbers(value):
    return [float(n) for n in re.findall(r'-?\d+\.?\d*', value)]


def colour_in(value, index=0):
    return [m.group(0) for m in re.finditer(COLOUR_FN, value)][index]


@tagged('post_install', '-at_install')
class TestThemeHomeMenu(ShellProbeCase):
    """Home menu look (R10 to R12, R14)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        menus = cls.env['ir.ui.menu']
        action = f"ir.actions.act_window,{cls.fixtures['kanban_action']}"
        # enough applications to scroll the home menu, one of them with a glyph icon
        for index in range(40):
            menus.create({
                'name': f'Cws home {index:02}', 'action': action,
                'web_icon': 'base,static/description/icon.png',
            })
        menus.create({
            'name': 'Cws home glyph', 'action': action, 'web_icon': 'oi-apps,#FFFFFF,#336699',
        })

    def home_page(self, scheme='light', **kwargs):
        return self.page('/odoo', scheme=scheme, **kwargs)

    def wait_home(self):
        self.wait("document.body.classList.contains('o_home_menu_background') && "
                  f"document.querySelectorAll('{TILE}').length > 5 && "
                  "!!document.querySelector('.o_main_navbar')", timeout=60)
        self.js("new Promise((resolve) => setTimeout(resolve, 700))")

    def _background(self, scheme, contrast, alpha, dot):
        with self.home_page(scheme):
            self.wait_home()
            layers = split_top_level(self.style('body', 'background-image')['background-image'])
            self.assertEqual(len(layers), 5, layers)
            self.assertTrue(layers[0].startswith('linear-gradient(45deg'), layers[0])
            self.assertTrue(layers[1].startswith('linear-gradient(135deg'), layers[1])
            self.assertTrue(layers[2].startswith('linear-gradient('), layers[2])
            self.assertTrue(layers[3].startswith('radial-gradient('), layers[3])
            self.assertTrue(layers[4].startswith('radial-gradient('), layers[4])
            # the page colour leads layers 1 to 3
            page = self.style('body', 'background-color')['background-color']
            for layer in layers[:3]:
                self.assertIn(page, layer)
            self.assertIn('rgba(0, 0, 0, 0)', layers[0])
            for stop in ('95%', '30%', '60%'):
                self.assertIn(stop, layers[1])
            # layer 4: the contrast colour out to 20 %, transparent at 400 %
            self.assertIn('20%', layers[3])
            self.assertIn('400%', layers[3])
            self.assertColour(colour_in(layers[3]), contrast, alpha=alpha)
            # layer 5: one dot on a 12 px grid
            self.assertColour(colour_in(layers[4]), dot[0], alpha=dot[1])
            style = self.style('body', 'background-size', 'background-repeat')
            sizes = split_top_level(style['background-size'])
            repeats = split_top_level(style['background-repeat'])
            self.assertEqual(sizes[4], '12px 12px')
            self.assertEqual(sizes[2], '100% 40%')
            self.assertEqual([sizes[0], sizes[1], sizes[3]], ['auto'] * 3)
            self.assertEqual(repeats[:4], ['no-repeat'] * 4)
            self.assertEqual(repeats[4], 'repeat')
            # opening an application removes the layers
            self.js("document.querySelector('.o_home_menu .o_app').click()")
            self.wait("!document.body.classList.contains('o_home_menu_background')", timeout=30)
            self.assertEqual(self.style('body', 'background-image')['background-image'], 'none')

    def test_A19_home_background_layers_light(self):
        self._background('light', '#E9ECEF', 0.95, ('#000000', 1.0))

    def test_A19_home_background_layers_dark(self):
        self._background('dark', '#151518', 0.93, ('#FFFFFF', 0.75))

    def _icon_square(self, scheme):
        with self.home_page(scheme):
            self.wait_home()
            icon = self.style(
                TILE_ICON, 'width', 'height', 'padding-top', 'background-color', 'border-radius',
                'box-shadow')
            self.assertEqual(
                (icon['width'], icon['height'], icon['padding-top'], icon['border-radius']),
                ('70px', '70px', '10px', '8px'))
            shadows = split_top_level(icon['box-shadow'])
            if scheme == 'light':
                self.assertColour(icon['background-color'], '#FFFFFF')
                # a 1 px ring, then six soft layers, offset 1, 2, 3, 5, 10 and 24 px
                self.assertEqual(len(shadows), 7, shadows)
                self.assertEqual(numbers(shadows[0])[-4:], [0, 0, 0, 1])
                self.assertEqual([numbers(s)[-3] for s in shadows[1:]], [1, 2, 3, 5, 10, 24])
                for shadow in shadows[1:]:
                    colour = colour_in(shadow)
                    self.assertColour(colour, '#2A3346', alpha=parse_colour(colour)[3])
                    self.assertTrue(0.025 <= parse_colour(colour)[3] <= 0.045, colour)
                    self.assertLess(numbers(shadow.split(')')[-1])[-1], 0)  # negative spread
            else:
                self.assertColour(icon['background-color'], '#2C2E35')
                self.assertEqual(len(shadows), 1, shadows)
                self.assertIn('inset', shadows[0])
                self.assertColour(colour_in(shadows[0]), '#3E3F47')
                self.assertEqual(numbers(shadows[0])[-4:], [0, 0, 0, 1])

    def test_A21_icon_squares_light(self):
        self._icon_square('light')

    def test_A21_icon_squares_dark(self):
        self._icon_square('dark')

    def _hover_press(self, scheme):
        with self.home_page(scheme):
            self.wait_home()
            rest = self.style(TILE_ICON, 'box-shadow')['box-shadow']
            transition = self.style(TILE_ICON, 'transition-duration', 'transition-property',
                                    'transition-timing-function')
            self.assertEqual(transition['transition-duration'], '0.1s')
            self.assertEqual(transition['transition-property'], 'box-shadow')
            self.assertEqual(transition['transition-timing-function'], 'ease-in')
            with self.forced(TILE, 'hover'):
                hover = self.style(TILE_ICON, 'box-shadow', 'transform')
                self.assertNotEqual(hover['box-shadow'], rest)
                self.assertEqual(hover['transform'], 'none')
                if scheme == 'light':
                    shadows = split_top_level(hover['box-shadow'])
                    self.assertEqual(len(shadows), 3, shadows)
                    self.assertColour(colour_in(shadows[0]), '#000000', alpha=0.15)
                    self.assertColour(colour_in(shadows[1]), '#091E42', alpha=0.25)
                    self.assertEqual(numbers(shadows[1].split(')')[-1]), [0, 4, 8, -2])
                    self.assertColour(colour_in(shadows[2]), '#091E42', alpha=0.08)
                else:
                    self.assertColour(colour_in(hover['box-shadow']), '#56575E')
            with self.forced(TILE, 'hover', 'active'):
                pressed = self.style(TILE_ICON, 'transform', 'transition-duration',
                                     'transform-origin')
                # translateY(-2px) scale(.98), from the icon's bottom centre
                self.assertEqual(numbers(pressed['transform'].split('(')[1]),
                                 [0.98, 0, 0, 0.98, 0, -2])
                self.assertEqual(pressed['transition-duration'], '0s')
                self.assertEqual(pressed['transform-origin'], '35px 70px')

    def test_A22_tile_hover_press_light(self):
        self._hover_press('light')

    def test_A22_tile_hover_press_dark(self):
        self._hover_press('dark')

    def _tile_names(self, scheme, size=(1600, 900), touch=False):
        with self.home_page(scheme, size=size, touch=touch):
            self.wait_home()
            name = self.style(TILE_NAME, 'color', 'text-shadow', 'font-size')
            if scheme == 'light':
                self.assertColour(name['color'], '#212529')
                self.assertEqual(name['text-shadow'], 'none')
            else:
                self.assertColour(name['color'], '#FFFFFF')
                shadows = split_top_level(name['text-shadow'])
                self.assertEqual(len(shadows), 3, shadows)
                self.assertColour(colour_in(shadows[0]), '#000000', alpha=0.75)
                self.assertEqual(numbers(shadows[0].split(')')[-1]), [0, 1, 2])
                for glow in shadows[1:]:
                    self.assertEqual(numbers(glow.split(')')[-1]), [0, 0, 5])
                    self.assertColour(colour_in(glow), '#000000', alpha=0.05)
            return name['font-size']

    def test_A24_tile_names_light(self):
        self.assertEqual(self._tile_names('light'), '14px')

    def test_A24_tile_names_dark(self):
        self.assertEqual(self._tile_names('dark'), '14px')

    def test_A24_tile_names_mobile(self):
        self.assertEqual(self._tile_names('light', size=MOBILE, touch=True), '13px')

    def _focus_wash(self, scheme, wash, outline):
        with self.home_page(scheme):
            self.wait_home()
            self.key('ArrowRight')
            self.wait("!!document.querySelector('.o_home_menu .o_app.o_focused')")
            got = self.style('.o_home_menu .o_app.o_focused', 'background-color', 'outline-color',
                             'outline-width', 'outline-style', 'border-radius')
            self.assertColour(got['background-color'], wash, alpha=0.75)
            self.assertColour(got['outline-color'], outline)
            self.assertEqual(got['outline-width'], '1px')
            self.assertEqual(got['outline-style'], 'solid')
            self.assertEqual(got['border-radius'], '6px')

    def test_A25_focus_wash_light(self):
        self._focus_wash('light', '#E6F2F3', '#017E84')

    def test_A25_focus_wash_dark(self):
        self._focus_wash('dark', '#3B4C52', '#1CBCB1')

    def test_A27_dragged_tile(self):
        with self.home_page():
            self.wait_home()
            # a tile with a menu xml id: only those can be reordered
            drag_tile = '.o_home_menu .o_app:not([data-menu-xmlid=""])'
            self.assertEqual(self.style(drag_tile, 'rotate')['rotate'], 'none')
            motion = self.style(drag_tile, 'transition-property', 'transition-duration')
            self.assertEqual(motion['transition-property'], 'rotate')
            self.assertEqual(motion['transition-duration'], '0.5s')
            rest = self.style(f'{drag_tile} .o_app_icon', 'box-shadow')['box-shadow']
            self.pointer_to(drag_tile)  # scrolls it into view
            box = self.rect(drag_tile)
            x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
            request = self.browser._websocket_request

            def mouse(kind, dx=0):
                request('Input.dispatchMouseEvent', params={
                    'type': kind, 'button': 'left', 'buttons': 0 if kind == 'mouseReleased' else 1,
                    'clickCount': 1, 'x': x + dx, 'y': y,
                })

            request('Input.dispatchMouseEvent', params={'type': 'mouseMoved', 'x': x, 'y': y})
            mouse('mousePressed')
            self.js("new Promise((resolve) => setTimeout(resolve, 700))")
            mouse('mouseMoved', 14)
            self.wait("!!document.querySelector('.o_home_menu .o_app.o_dragged_app')")
            self.js("new Promise((resolve) => setTimeout(resolve, 700))")
            self.assertEqual(
                self.style('.o_home_menu .o_app.o_dragged_app', 'rotate')['rotate'], '6deg')
            icon = self.style('.o_home_menu .o_app.o_dragged_app .o_app_icon',
                              'box-shadow', 'transform')
            shadows = split_top_level(icon['box-shadow'])
            self.assertEqual(len(shadows), 4, shadows)
            self.assertEqual(numbers(shadows[3].split(')')[-1]), [0, 8, 15, -10])
            self.assertColour(colour_in(shadows[3]), '#091E42', alpha=0.5)
            self.assertEqual(numbers(icon['transform'].split('(')[1]), [1, 0, 0, 1, 0, -1])
            mouse('mouseReleased', 14)
            # the pointer leaves the tile, so that its icon is not left in the hover state
            request('Input.dispatchMouseEvent', params={'type': 'mouseMoved', 'x': 5, 'y': 400})
            self.wait("!document.querySelector('.o_home_menu .o_app.o_dragged_app')")
            self.js("new Promise((resolve) => setTimeout(resolve, 700))")
            self.assertEqual(self.style(drag_tile, 'rotate')['rotate'], 'none')
            self.assertEqual(
                self.style(f'{drag_tile} .o_app_icon', 'box-shadow')['box-shadow'], rest)

    def _tray_wash(self, scheme, wash):
        with self.home_page(scheme):
            self.wait_home()
            entry = USER_MENU
            with self.forced(entry, 'hover'):
                self.assertColour(
                    self.style(entry, 'background-color')['background-color'], wash, alpha=0.1)

    def test_A28_tray_wash_light(self):
        self._tray_wash('light', '#000000')

    def test_A28_tray_wash_dark(self):
        self._tray_wash('dark', '#FFFFFF')

    def test_A110_tray_open_no_outline(self):
        with self.home_page():
            self.wait_home()
            entry = USER_MENU
            self.js(f"document.querySelector({entry!r}).click()")
            self.wait(f"document.querySelector({entry!r}).getAttribute('aria-expanded') === 'true'")
            with self.forced(entry, 'focus', 'focus-visible'):
                got = self.style(entry, 'outline-style', 'outline-width')
                self.assertTrue(
                    got['outline-style'] == 'none' or got['outline-width'] == '0px', got)

    def test_A111_scrollbar_and_glyph_tile(self):
        with self.home_page():
            self.wait_home()
            root = '.o_home_menu'
            self.assertGreater(
                self.js(f"document.querySelector('{root}').scrollHeight"),
                self.js(f"document.querySelector('{root}').clientHeight"))
            self.assertEqual(self.style(root, 'scrollbar-width')['scrollbar-width'], 'auto')
            self.assertEqual(
                self.style(root, 'width', pseudo='::-webkit-scrollbar')['width'], '8px')
            thumb = self.style(root, 'background-color', 'border-top-left-radius',
                               pseudo='::-webkit-scrollbar-thumb')
            self.assertColour(thumb['background-color'], '#212529', alpha=0.5)
            self.assertGreaterEqual(float(thumb['border-top-left-radius'][:-2]), 4)
            track = self.style(root, 'background-color', pseudo='::-webkit-scrollbar-track')
            self.assertEqual(parse_colour(track['background-color'])[3], 0)
            glyph = '.o_home_menu .o_app .o_cws_glyph_icon'
            square = self.style(glyph, 'width', 'height', 'border-radius', 'background-color')
            self.assertEqual((square['width'], square['height'], square['border-radius']),
                             ('70px', '70px', '8px'))
            self.assertColour(square['background-color'], '#336699')
            self.assertEqual(self.style(f'{glyph} i', 'font-size')['font-size'], '35px')
        with self.home_page(size=MOBILE, touch=True):
            self.wait_home()
            self.assertEqual(
                self.style('.o_home_menu', 'scrollbar-width')['scrollbar-width'], 'none')

    def _touch_search(self, scheme, height, border):
        with self.home_page(scheme, size=MOBILE, touch=True):
            self.wait_home()
            field = '.o_home_menu .o_cws_touch_search'
            got = self.style(
                field, 'height', 'border-top-left-radius', 'padding-top', 'padding-left',
                'background-color', 'border-top-width', 'border-top-color', 'border-left-width',
                'border-right-width', 'border-bottom-width', 'margin-top', 'margin-bottom')
            self.assertEqual(got['height'], f'{height}px')
            self.assertEqual(got['border-top-left-radius'], '6px')
            self.assertEqual((got['padding-top'], got['padding-left']), ('8px', '8px'))
            self.assertEqual((got['margin-top'], got['margin-bottom']), ('8px', '16px'))
            self.assertColour(
                got['background-color'], '#F8F9FA' if scheme == 'light' else '#1F1F23')
            for side in ('top', 'left', 'right', 'bottom'):
                self.assertEqual(got[f'border-{side}-width'], '1px' if border else '0px')
            if border:
                self.assertColour(got['border-top-color'], border)
            # the field leads the scrolled content: the page opens past it
            box = self.rect(field)
            # light: fully past; dark: the 1 px border of the taller field (D5) ends 1 px below
            self.assertLessEqual(box['y'] + box['height'], 46 + (1 if border else 0))

    def test_A30_A125_touch_search_light(self):
        self._touch_search('light', 37, None)

    def test_A30_A125_touch_search_dark(self):
        self._touch_search('dark', 39, '#3C3E4A')

    def test_D5_touch_tiles_follow_the_taller_dark_field(self):
        tiles = {}
        for scheme in ('light', 'dark'):
            with self.home_page(scheme, size=MOBILE, touch=True):
                self.wait_home()
                tiles[scheme] = self.rect(TILE_ICON)['y']
        # the page opens scrolled by 46 px; the dark field is 2 px taller and nothing makes up
        # for it, so its first tile row sits 2 px lower (S1, S4 dark captures: row at y 67)
        self.assertAlmostEqual(tiles['dark'] - tiles['light'], 2, delta=.5)
        self.assertAlmostEqual(tiles['dark'], 67, delta=1.5)

    def test_A30_touch_search_width(self):
        with self.home_page(size=(800, 900), touch=True):
            self.wait_home()
            self.assertEqual(self.rect('.o_home_menu')['width'], 800)
        with self.home_page(size=(1100, 900), touch=True):
            self.wait_home()
            self.assertEqual(self.rect('.o_home_menu')['width'], 850)
