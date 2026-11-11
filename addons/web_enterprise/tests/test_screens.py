# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of the shell, taken on demand (not part of the normal run).

Run with ``--test-tags web_shell_screens`` and ``--screenshots <dir>`` on a database that has
the demo data and the Contacts, CRM, Sales, Calendar and Project applications.
"""
import base64
import contextlib
import json
import logging
import pathlib
import time

import odoo
from odoo.tests import HttpCase, tagged
from odoo.tests.common import ChromeBrowser, flushing_cursor

from .theme_probe import ThemeProbeCase

TAGS = ('-standard', 'web_shell_screens', 'post_install', '-at_install')
THEME_TAGS = ('-standard', 'web_theme_screens', 'post_install', '-at_install')

_logger = logging.getLogger(__name__)

KEYS = {
    'Right': ('ArrowRight', 39),
    'Down': ('ArrowDown', 40),
    'Escape': ('Escape', 27),
}

CLICK_TEXT = """
(() => {
    const [selector, text] = %s;
    const el = [...document.querySelectorAll(selector)]
        .find((e) => e.textContent.trim().startsWith(text));
    if (!el) { throw new Error("no " + selector + " with text " + text); }
    el.click();
})()
"""


class ShellScreens(HttpCase):
    """Base: one browser session per test, driven with raw DevTools commands."""

    def setUp(self):
        super().setUp()
        self.admin = self.env.ref('base.user_admin')
        self.settings = self.env['res.users.settings']._find_or_create_for_user(self.admin)

    @contextlib.contextmanager
    def shell(self, url='/odoo'):
        browser = ChromeBrowser(self, headless=True)
        with self.allow_requests(browser=browser), contextlib.ExitStack() as atexit:
            atexit.enter_context(flushing_cursor(self.cr))
            atexit.callback(self._wait_remaining_requests)
            atexit.enter_context(browser.cleanup)
            self.authenticate('admin', 'admin', browser=browser)
            self.browser = browser
            self.goto(url)
            yield browser

    def goto(self, url):
        self.browser.navigate_to(self.base_url() + url, wait_stop=False)
        self.wait("!!document.querySelector('.o_web_client')")
        self.pause()

    def js(self, code):
        res = self.browser._websocket_request('Runtime.evaluate', params={
            'expression': code, 'awaitPromise': True, 'returnByValue': True,
        })
        if res.get('exceptionDetails'):
            raise AssertionError(json.dumps(res['exceptionDetails'])[:600])
        return res['result'].get('value')

    def wait(self, condition, timeout=30):
        self.assertTrue(
            self.browser._wait_ready(condition, timeout=timeout), f'never true: {condition}',
        )

    def pause(self, seconds=1.0):
        time.sleep(seconds)

    def click(self, selector):
        self.wait(f"!!document.querySelector({json.dumps(selector)})")
        self.js(f"document.querySelector({json.dumps(selector)}).click()")
        self.pause(0.5)

    def click_text(self, selector, text):
        self.wait(
            f"[...document.querySelectorAll({json.dumps(selector)})]"
            f".some((e) => e.textContent.trim().startsWith({json.dumps(text)}))"
        )
        self.js(CLICK_TEXT % json.dumps([selector, text]))
        self.pause(0.5)

    def press(self, *names):
        for name in names:
            key, code = KEYS[name]
            for kind in ('keyDown', 'keyUp'):
                self.browser._websocket_request('Input.dispatchKeyEvent', params={
                    'type': kind, 'key': key, 'code': key, 'windowsVirtualKeyCode': code,
                })
            self.pause(0.3)

    def type_char(self, char):
        for kind in ('keyDown', 'keyUp'):
            params = {
                'type': kind, 'key': char, 'code': 'Key' + char.upper(),
                'windowsVirtualKeyCode': ord(char.upper()),
            }
            if kind == 'keyDown':
                params['text'] = char
            self.browser._websocket_request('Input.dispatchKeyEvent', params=params)
        self.pause(0.8)

    def shot(self, prefix):
        self.pause(0.8)
        future = self.browser.take_screenshot(prefix)
        future.result(timeout=20)
        self.pause(0.5)

    def open_app(self, xmlid):
        self.click(f'a.o_app[data-menu-xmlid="{xmlid}"]')

    def home(self):
        self.wait("!!document.querySelector('.o_home_menu a.o_app')")

    def dark(self):
        self.settings.color_scheme = 'dark'

    def reorder(self):
        self.settings.homemenu_config = json.dumps(
            ['base.menu_administration', 'crm.crm_menu_root', 'contacts.menu_contacts'],
        )

    def more_leads(self):
        """Enough cards in the first column for the kanban to scroll."""
        stage = self.env['crm.stage'].search([], limit=1)
        self.env['crm.lead'].create([{
            'name': f'Extra opportunity {index}', 'type': 'opportunity',
            'stage_id': stage.id, 'user_id': self.admin.id,
            'expected_revenue': 1000 * index,
        } for index in range(1, 13)])

    def message(self):
        self.env['ir.config_parameter'].sudo().set_str(
            'sysadmin.message',
            '{"message": "<p><b>Maintenance:</b> the platform goes offline tonight from 11 pm, '
            'please save your work before then.</p>", "warning_type": "user"}',
        )


CRM = 'crm.crm_menu_root'


@tagged(*TAGS)
class TestScreensDesktop(ShellScreens):
    browser_size = '1600x900'

    def test_home(self):
        with self.shell():
            self.home()
            self.shot('s01_home_menu_')
            self.press('Right', 'Right', 'Down')
            self.shot('s02_home_keyboard_focus_')

    def test_search_palette(self):
        with self.shell():
            self.home()
            self.type_char('c')
            self.wait("!!document.querySelector('.o_command_palette')")
            self.shot('s03_home_search_palette_')

    def test_app_and_back(self):
        with self.shell():
            self.home()
            self.open_app(CRM)
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s04_app_navbar_')
            self.click('.o_navbar .o_menu_toggle')
            self.home()
            self.shot('s05_home_over_app_')
            self.press('Escape')
            self.wait("!document.querySelector('.o_home_menu')")
            self.shot('s06_back_to_app_')

    def test_reordered(self):
        self.reorder()
        with self.shell():
            self.home()
            self.shot('s09_home_reordered_')

    def test_admin_message(self):
        self.message()
        with self.shell():
            self.home()
            self.shot('s10_home_admin_message_')

    def test_preferences(self):
        with self.shell():
            self.home()
            self.click('.o_user_menu')
            self.click_text('.o-dropdown-item', 'My Preferences')
            self.wait("!!document.querySelector('.modal .o_field_widget[name=color_scheme]')")
            self.shot('s11_preferences_theme_')

    def test_user_form(self):
        with self.shell(f'/odoo/action-base.action_res_users/{self.admin.id}'):
            self.wait("!!document.querySelector('.o_form_view')")
            self.click_text('.o_notebook_headers .nav-link', 'Preferences')
            self.wait("!!document.querySelector('.o_field_widget[name=color_scheme]')")
            self.shot('s12_user_form_theme_')

    def test_dark(self):
        self.dark()
        with self.shell():
            self.home()
            self.shot('s13_home_dark_')
            self.open_app(CRM)
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s14_app_dark_')

    def test_view_switcher(self):
        with self.shell('/odoo/action-crm.crm_lead_action_pipeline'):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.click('.o_cp_switch_buttons .o_switch_view.o_list')
            self.wait("!!document.querySelector('.o_list_view')")
            self.shot('s15_view_switcher_list_')

    def test_kanban_headers(self):
        self.more_leads()
        with self.shell('/odoo/action-crm.crm_lead_action_pipeline'):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s16_kanban_header_top_')
            self.js(
                "(() => { const el = document.querySelector('.o_content');"
                " el.scrollTop = el.clientHeight; })()"
            )
            self.shot('s17_kanban_header_sticky_')


@tagged(*TAGS)
class TestScreensMobile(ShellScreens):
    browser_size = '390x844'
    touch_enabled = True

    def test_home(self):
        with self.shell():
            self.home()
            self.shot('s01_home_menu_mobile_')

    def test_burger_on_home(self):
        with self.shell():
            self.home()
            self.click('.o_mobile_menu_toggle')
            self.wait("!!document.querySelector('.o_burger_menu')")
            self.shot('s08_burger_on_home_mobile_')

    def test_search_palette(self):
        with self.shell():
            self.home()
            self.click('.o_cws_touch_search')
            self.wait("!!document.querySelector('.o_command_palette')")
            self.shot('s03_home_search_palette_mobile_')

    def test_app(self):
        with self.shell():
            self.home()
            self.open_app(CRM)
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s04_app_navbar_mobile_')
            self.click('.o_navbar .o_menu_toggle')
            self.wait("!!document.querySelector('.o_burger_menu_app, .o_sidebar_topbar')")
            self.shot('s07_mobile_app_menu_mobile_')
            self.click_text('.o_sidebar_topbar a', 'All Apps')
            self.home()
            self.shot('s05_home_over_app_mobile_')

    def test_burger_in_app(self):
        with self.shell():
            self.home()
            self.open_app(CRM)
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.click('.o_mobile_menu_toggle')
            self.wait("!!document.querySelector('.o_burger_menu')")
            self.shot('s20_burger_in_app_mobile_')

    def test_reordered(self):
        self.reorder()
        with self.shell():
            self.home()
            self.shot('s09_home_reordered_mobile_')

    def test_admin_message(self):
        self.message()
        with self.shell():
            self.home()
            self.shot('s10_home_admin_message_mobile_')

    def test_preferences(self):
        with self.shell():
            self.home()
            self.click('.o_mobile_menu_toggle')
            self.wait("!!document.querySelector('.o_burger_menu')")
            self.click_text('.o_burger_menu *', 'My Preferences')
            self.wait("!!document.querySelector('.modal .o_field_widget[name=color_scheme]')")
            self.shot('s11_preferences_theme_mobile_')

    def test_user_form(self):
        with self.shell(f'/odoo/action-base.action_res_users/{self.admin.id}'):
            self.wait("!!document.querySelector('.o_form_view')")
            self.click_text('.o_notebook_headers .nav-link', 'Preferences')
            self.wait("!!document.querySelector('.o_field_widget[name=color_scheme]')")
            self.js(
                "document.querySelector('.o_field_widget[name=color_scheme]')"
                ".scrollIntoView({block: 'center'})"
            )
            self.shot('s12_user_form_theme_mobile_')

    def test_dark(self):
        self.dark()
        with self.shell():
            self.home()
            self.shot('s13_home_dark_mobile_')
            self.open_app(CRM)
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s14_app_dark_mobile_')

    def test_kanban_headers(self):
        self.more_leads()
        with self.shell('/odoo/action-crm.crm_lead_action_pipeline'):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.shot('s16_kanban_header_top_mobile_')
            # on phones each unfolded column is the vertical scroller
            self.js(
                "(() => { const el = document.querySelector("
                "'.o_kanban_group:not(.o_column_folded)');"
                " el.scrollTop = el.clientHeight; })()"
            )
            self.shot('s17_kanban_header_sticky_mobile_')

    def test_pivot(self):
        with self.shell('/odoo/action-crm.crm_lead_action_pipeline'):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.click('.o_cp_switch_buttons button')
            self.pause()
            self.click_text('button', 'Pivot')
            self.wait("!!document.querySelector('.o_pivot')")
            self.shot('s18_pivot_mobile_')

    def test_view_switcher_sheet(self):
        with self.shell('/odoo/action-crm.crm_lead_action_pipeline'):
            self.wait("!!document.querySelector('.o_kanban_view .o_kanban_record')")
            self.click('.o_cp_switch_buttons button')
            self.pause()
            self.shot('s19_view_switcher_mobile_')


# -- 001b: one capture per spec screen (screens/index.md), light, dark and mobile ----------

PIPELINE = '/odoo/action-crm.crm_lead_action_pipeline'
DESKTOP = (1600, 900)
PHONE = (390, 844)


@tagged(*THEME_TAGS)
class ThemeScreens(ThemeProbeCase):
    """Screens S1-S33. Files go to ``<screenshots>/web_theme/`` under the spec's names."""

    @classmethod
    def setUpClass(cls):
        # the probe fixtures add views to the data the screens show: skip them
        super(ThemeProbeCase, cls).setUpClass()

    def setUp(self):
        super().setUp()
        # no onboarding pointer over the captures
        self.env.ref('base.user_admin').tour_enabled = False

    # -- plumbing -------------------------------------------------------------------

    def snap(self, name):
        """Wait for animations to settle and store the viewport as ``name``."""
        time.sleep(1.2)
        res = self.browser._websocket_request('Page.captureScreenshot')
        folder = pathlib.Path(odoo.tools.config['screenshots']) / 'web_theme'
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(base64.b64decode(res['data']))

    def each(self, stem, url, prepare, *, desktop=True, mobile=False, dark=True):
        """Capture ``stem`` for every variant; ``prepare(mobile)`` sets the state up.

        A variant that fails is logged and the next one still runs; the test fails at the end.
        """
        errors = []
        variants = []
        for is_mobile in ((False,) if not mobile else ((False, True) if desktop else (True,))):
            for scheme in (('light', 'dark') if dark else ('light',)):
                variants.append((is_mobile, scheme))
        for is_mobile, scheme in variants:
            name = stem + ('-dark' if scheme == 'dark' else '') \
                + ('.mobile' if is_mobile else '') + '.png'
            try:
                with self.page(url, scheme=scheme, size=PHONE if is_mobile else DESKTOP,
                               touch=is_mobile, login='admin' if url != '/web/login' else None):
                    prepare(is_mobile)
                    self.snap(name)
            except Exception as error:  # noqa: BLE001 - keep capturing the other variants
                _logger.error('screen %s failed: %s', name, error)
                with contextlib.suppress(Exception):
                    self.snap('failed-' + name)
                errors.append(f'{name}: {error}')
        self.assertFalse(errors, '\n'.join(errors))

    def box(self, selector, text=None, index=0):
        return self.js(f"""(() => {{
            let all = [...document.querySelectorAll({json.dumps(selector)})];
            const text = {json.dumps(text)};
            if (text) {{ all = all.filter((e) => e.textContent.trim().includes(text)); }}
            const el = all[{int(index)}];
            if (!el) {{
                throw new Error("no element for " + {json.dumps(selector)} + {json.dumps(text)});
            }}
            el.scrollIntoView({{block: 'nearest', inline: 'nearest'}});
            const r = el.getBoundingClientRect();
            return {{x: r.x, y: r.y, width: r.width, height: r.height}};
        }})()""")

    def mouse(self, kind, x, y, **extra):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': kind, 'x': x, 'y': y, **extra,
        })

    def hover(self, selector, text=None, index=0, dx=0.5, dy=0.5):
        self.wait(f"document.querySelectorAll({json.dumps(selector)}).length > {int(index)}")
        box = self.box(selector, text, index)
        self.mouse('mouseMoved', box['x'] + box['width'] * dx, box['y'] + box['height'] * dy)
        time.sleep(0.4)

    def tap(self, selector, text=None, index=0):
        """A real click: pointer move, press, release."""
        self.wait(f"document.querySelectorAll({json.dumps(selector)}).length > {int(index)}")
        box = self.box(selector, text, index)
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        self.mouse('mouseMoved', x, y)
        self.mouse('mousePressed', x, y, button='left', clickCount=1)
        self.mouse('mouseReleased', x, y, button='left', clickCount=1)
        time.sleep(0.6)

    def press(self, name, modifiers=0):
        key, code, keycode = {
            'Right': ('ArrowRight', 'ArrowRight', 39), 'Down': ('ArrowDown', 'ArrowDown', 40),
            'k': ('k', 'KeyK', 75),
        }[name]
        for kind in ('rawKeyDown', 'keyUp'):
            params = {'type': kind, 'key': key, 'code': code, 'windowsVirtualKeyCode': keycode,
                      'modifiers': modifiers}
            self.browser._websocket_request('Input.dispatchKeyEvent', params=params)
        time.sleep(0.4)

    def ready(self, selector):
        self.wait(f"!!document.querySelector({json.dumps(selector)})", timeout=60)
        time.sleep(0.8)

    def home(self):
        self.ready('.o_home_menu a.o_app')

    def seed(self):
        """Community has no demo contacts or confirmed orders here: add what the screens show."""
        env = self.env
        tags = env['res.partner.category'].create([
            {'name': name, 'color': color} for name, color in (
                ('Consulting Services', 5), ('Vendor', 10), ('Retailer', 1), ('Design', 3))
        ])
        partners = env['res.partner'].create([{
            'name': f'{first} {last}', 'email': f'{first.lower()}@example.com',
            'phone': f'+1 555 010 {index:04d}', 'city': 'Springfield',
            'is_company': index % 3 == 0, 'category_id': [(6, 0, tags[index % 4].ids)],
        } for index, (first, last) in enumerate(zip(
            ('Anna', 'Boris', 'Clara', 'Dmitri', 'Elena', 'Farid', 'Greta', 'Hugo', 'Irene',
             'Jonas', 'Karin', 'Luca'),
            ('Moreau', 'Ivanov', 'Rossi', 'Petrov', 'Garcia', 'Haddad', 'Lindqvist', 'Meyer',
             'Novak', 'Berg', 'Dahl', 'Conti'), strict=True)
        )])
        users = env['res.users'].create([{
            'name': name, 'login': name.lower(), 'group_ids': [(6, 0, env.ref('base.group_user').ids
                + env.ref('sales_team.group_sale_salesman').ids)],
        } for name in ('Ludwig', 'Mireille')])
        product = env['product.product'].search([('sale_ok', '=', True)], limit=1) \
            or env['product.product'].create({'name': 'Service', 'type': 'service'})
        owners = (env.ref('base.user_admin') + users)
        orders = env['sale.order'].create([{
            'partner_id': partners[index].id, 'user_id': owners[index % 3].id,
            'order_line': [(0, 0, {'product_id': product.id, 'product_uom_qty': 1 + index,
                                   'price_unit': 250.0 * (index + 1)})],
        } for index in range(8)])
        orders[:3].action_confirm()
        orders[3:5].write({'state': 'sent'})
        stages = env['crm.stage'].search([], order='sequence, id')
        crm_tags = env['crm.tag'].create([{'name': n, 'color': c} for n, c in (
            ('Product', 1), ('Design', 5), ('Information', 4), ('Consulting', 7))])
        leads = env['crm.lead'].create([{
            'name': f'Opportunity {index}', 'type': 'opportunity',
            'stage_id': stages[(2 + index) % len(stages)].id,
            'user_id': env.ref('base.user_admin').id, 'partner_id': partners[index].id,
            'expected_revenue': 4000 * (index + 1), 'priority': str(index % 4),
            'tag_ids': [(6, 0, crm_tags[index % 4].ids)],
            'date_deadline': (False, '2026-09-20', '2026-10-10', '2026-11-12')[index],
        } for index in range(4)])
        return partners, orders, leads

    def lead(self):
        return self.seed()[2][0]

    def open_tab(self, text):
        self.tap('.o_notebook_headers .nav-link', text)

    def switch_view(self, mode, mobile):
        if mobile:
            self.tap('.o_cp_switch_buttons button')
            self.tap('.o_bottom_sheet button, .o-overlay-item button, .modal button', mode.title())
        else:
            self.tap(f'.o_cp_switch_buttons .o_switch_view.o_{mode}')

    # -- S1-S4 home menu --------------------------------------------------------------

    def test_s01_home_menu(self):
        self.each('01-home-menu', '/odoo', lambda m: self.home(), mobile=True)

    def test_s02_tile_hover(self):
        self.each('02-home-tile-hover', '/odoo',
                  lambda m: (self.home(), self.hover('.o_home_menu a.o_app', index=4)))

    def test_s03_keyboard_focus(self):
        def prepare(mobile):
            self.home()
            self.press('Right')
            self.press('Right')
            self.press('Down')
            self.hover('.o_menu_systray button', index=0)
        self.each('03-home-keyboard-focus', '/odoo', prepare)

    def test_s04_touch_search(self):
        def prepare(mobile):
            self.home()
            self.js("document.querySelectorAll('.o_home_menu, .o_action_manager, .o_content')"
                    ".forEach((e) => { e.scrollTop = 0; })")
            self.js("document.querySelector('.o_cws_touch_search')"
                    ".scrollIntoView({block: 'center'})")
            self.hover('.o_home_menu a.o_app', text='Settings')
        self.each('04-home-touch-search', '/odoo', prepare, desktop=False, mobile=True)

    # -- S5-S10 application and kanban --------------------------------------------------

    def test_s05_app_kanban(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
        self.each('05-app-kanban', PIPELINE, prepare, mobile=True)

    def test_s06_grid_button_hover(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.hover('.o_navbar .o_menu_toggle')
        self.each('06-grid-button-hover', PIPELINE, prepare)

    def test_s07_section_menu(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.tap('.o_menu_sections .dropdown-toggle', 'Sales')
            self.hover('.o-dropdown--menu .o-dropdown-item, .dropdown-menu .dropdown-item', index=1)
        self.each('07-section-menu-open', PIPELINE, prepare)

    def test_s08_home_over_app(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.tap('.o_navbar .o_menu_toggle')
            if mobile:
                self.tap('.o_sidebar_topbar a', 'All Apps')
            self.home()
        self.each('08-home-over-app', PIPELINE, prepare, mobile=True)

    def test_s09_kanban_sticky(self):
        self.more_leads()

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            target = ".o_kanban_group:not(.o_column_folded)" if mobile else ".o_content"
            self.js(f"(() => {{ const el = document.querySelector('{target}');"
                    " el.scrollTop = el.clientHeight; })()")
        self.each('09-kanban-sticky', PIPELINE, prepare, mobile=True)

    def more_leads(self):
        stage = self.env['crm.stage'].search([], limit=1)
        self.env['crm.lead'].create([{
            'name': f'Extra opportunity {index}', 'type': 'opportunity',
            'stage_id': stage.id, 'user_id': self.env.ref('base.user_admin').id,
            'expected_revenue': 1000 * index,
        } for index in range(1, 13)])

    def test_s10_kanban_ungrouped(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            if not mobile:
                self.hover('.o_kanban_record', index=1)
        self.each('10-kanban-ungrouped',
                  '/odoo/action-contacts.action_contacts?view_type=kanban',
                  prepare, mobile=True)

    # -- S11-S15 lists and search panel ----------------------------------------------------

    def test_s11_list(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_list_view .o_data_row')
            self.hover('.o_data_row', index=2)
        self.each('11-list', '/odoo/action-contacts.action_contacts?view_type=list', prepare)

    def test_s12_list_selected(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_list_view .o_data_row')
            self.tap('.o_data_row .o_list_record_selector', index=1)
            self.tap('.o_data_row .o_list_record_selector', index=2)
        self.each('12-list-selected',
                  '/odoo/action-contacts.action_contacts?view_type=list', prepare)

    def test_s13_list_grouped(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_list_view')
            if self.js("!!document.querySelector('.o_facet_remove')"):
                self.tap('.o_facet_remove')
            self.tap('.o_searchview_dropdown_toggler')
            self.tap('.o_group_by_menu .o-dropdown-item', 'Salesperson')
            self.ready('.o_group_header')
            self.mouse('mousePressed', 800, 760, button='left', clickCount=1)
            self.mouse('mouseReleased', 800, 760, button='left', clickCount=1)
            time.sleep(0.5)
            if not self.js("!!document.querySelector('.o_data_row')"):
                self.tap('.o_group_header', index=0)
            try:
                self.ready('.o_data_row')
            except AssertionError:
                self.snap('dbg-13.png')
                raise
            self.hover('.o_group_header', index=0)
        self.each('13-list-grouped', '/odoo/action-sale.action_quotations_with_onboarding', prepare)

    def test_s14_search_panel_kanban(self):
        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
        self.each('14-search-panel', '/odoo/action-base.open_module_tree', prepare, mobile=True)

    def test_s15_search_panel_list(self):
        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.tap('.o_cp_switch_buttons .o_switch_view.o_list')
            self.ready('.o_list_view .o_data_row')
            self.mouse('mouseMoved', 800, 880)
        self.each('15-search-panel-list', '/odoo/action-base.open_module_tree', prepare)

    # -- S16-S20 forms ---------------------------------------------------------------------

    def test_s16_form(self):
        order = self.seed()[1][0]

        def prepare(mobile):
            self.ready('.o_form_view .o_form_sheet')
            self.open_tab('Order Lines') if not mobile else None
        self.each('16-form', f'/odoo/action-sale.action_orders/{order.id}', prepare, mobile=True)

    def test_s17_statusbar_hover(self):
        lead = self.lead()
        self.each('17-form-statusbar-hover', f'/odoo/action-crm.crm_lead_action_pipeline/{lead.id}',
                  lambda m: (self.ready('.o_form_view .o_statusbar_status button'),
                             self.hover('.o_statusbar_status button', text='Won')))

    def test_s18_focus_popover(self):
        lead = self.lead()

        def prepare(mobile):
            self.ready('.o_form_view .o_form_sheet')
            self.open_tab('Extra')
            self.tap('.o_field_widget[name=date_deadline]')
            self.ready('.o_datetime_picker')
        self.each('18-form-focus-popover',
                  f'/odoo/action-crm.crm_lead_action_pipeline/{lead.id}', prepare)

    def test_s19_lead_form(self):
        lead = self.lead()
        self.each('19-lead-form', f'/odoo/action-crm.crm_lead_action_pipeline/{lead.id}',
                  lambda m: self.ready('.o_form_view .o_statusbar_status button'))

    def test_s20_ribbon(self):
        partner = self.seed()[0][0]
        partner.active = False
        self.each('20-form-ribbon', f'/odoo/action-contacts.action_contacts/{partner.id}',
                  lambda m: self.ready('.o_form_view .ribbon'))

    # -- S21-S26 settings, calendar, analysis ----------------------------------------------

    def test_s21_settings(self):
        self.each('21-settings', '/odoo/action-base_setup.action_general_configuration',
                  lambda m: self.ready('.o_form_view .settings'), mobile=True)

    def test_s22_calendar(self):
        self.each('22-calendar', '/odoo/action-calendar.action_calendar_event',
                  lambda m: self.ready('.o_calendar_container, .o_calendar_renderer, .fc'),
                  mobile=True)

    def test_s23_pivot(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.tap('.o_cp_switch_buttons .o_switch_view.o_pivot')
            try:
                self.ready('.o_pivot .o_pivot_cell_value')
            except AssertionError:
                self.snap('dbg-23a.png')
                raise
            self.hover('.o_pivot td.o_pivot_cell_value', index=5)
        self.each('23-pivot', PIPELINE, prepare)

    def graph(self, stem, mode):
        self.seed()

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.tap('.o_cp_switch_buttons .o_switch_view.o_graph')
            self.ready('.o_graph_renderer canvas')
            if mode != 'bar':
                self.tap(f'.o_graph_button[data-mode={mode}], button[data-mode={mode}]')
            # park the pointer on the empty top bar: no tooltip of the switcher in the capture
            self.mouse('mouseMoved', 800, 22)
            time.sleep(1.2)
        self.each(stem, PIPELINE, prepare)

    def test_s24_graph_bar(self):
        self.graph('24-graph-bar', 'bar')

    def test_s25_graph_line(self):
        self.graph('25-graph-line', 'line')

    def test_s26_graph_pie(self):
        self.graph('26-graph-pie', 'pie')

    # -- S27-S32 overlays --------------------------------------------------------------------

    def test_s27_user_menu(self):
        self.seed()

        def prepare(mobile):
            # the spec capture opens the menu over the pipeline
            self.ready('.o_kanban_view .o_kanban_record')
            self.tap('.o_user_menu .dropdown-toggle, .o_user_menu')
            self.ready('.o-dropdown--menu')
        self.each('27-user-menu', PIPELINE, prepare)

    def test_s28_dialog(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.tap('.o_user_menu .dropdown-toggle, .o_user_menu')
            self.tap('.o-dropdown-item', 'Preferences')
            self.ready('.modal .o_field_widget[name=color_scheme]')
        self.each('28-dialog', PIPELINE, prepare)

    def test_s29_search_options(self):
        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.tap('.o_searchview_dropdown_toggler')
            self.tap('.o_filter_menu .o-dropdown-item', index=1)
            self.hover('.o_filter_menu .o-dropdown-item', index=1)
        self.each('29-search-options', PIPELINE, prepare)

    def test_s30_command_palette(self):
        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.press('k', modifiers=2)
            self.ready('.o_command_palette')
        self.each('30-command-palette', PIPELINE, prepare)

    def test_s31_bottom_sheet(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.tap('.o_cp_switch_buttons button')
            time.sleep(1)
        self.each('31-bottom-sheet', PIPELINE, prepare, desktop=False, mobile=True)

    def test_s32_list_tags(self):
        self.seed()

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.tap('.o_cp_switch_buttons .o_switch_view.o_list')
            self.ready('.o_list_view .o_data_row')
            self.mouse('mouseMoved', 800, 880)
        self.each('32-list-tags', PIPELINE, prepare)

    def test_s34_language_sheet(self):
        """The Language field's sheet on a phone, with a second language installed."""
        self.env['res.lang']._activate_lang('fr_FR')
        toggler = '.o_dialog .o_field_widget[name="lang"] .o_select_menu_toggler'

        def prepare(mobile):
            self.ready('.o_kanban_view .o_kanban_record')
            self.js("document.querySelector('.o_user_menu').click()")
            self.ready('[data-menu="preferences"]')
            self.js("document.querySelector('[data-menu=\"preferences\"]').click()")
            self.ready(toggler)
            self.tap(toggler)
            self.ready('.o_select_menu_menu .o_select_menu_item')
        self.each('34-language-sheet', PIPELINE, prepare, desktop=False, mobile=True)

    def test_s33_login(self):
        self.each('33-login', '/web/login', lambda m: time.sleep(1), mobile=True, dark=False)
