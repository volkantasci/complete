# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Owner decisions on 001a behaviour (001b R44, R45, E7, E8): the tile press after an early
move, and the Community apps-menu tour step while the home menu is shown."""
import time
from unittest import SkipTest

from odoo.modules.registry import Registry
from odoo.tests import HttpCase, tagged
from odoo.tests.common import get_db_name

from .theme_probe import ThemeProbeCase

try:
    from odoo.addons.hr_expense.tests import common as expense_common
except ImportError:  # the application is not on the addons path
    expense_common = None

TILES = '.o_home_menu .o_app'
TILE = 'a.o_app[data-menu-xmlid="cws_theme.menu_decisions"]'
CRM_TILE = 'a.o_app[data-menu-xmlid="crm.crm_menu_root"]'
HOLD = 0.5  # seconds, the hold of a pressed tile


@tagged('post_install', '-at_install')
class TestThemeTileRelease(ThemeProbeCase):
    """A101, A102, A118: real timed pointer and touch input on the home menu tiles."""

    # -- input ----------------------------------------------------------------------

    def _mouse(self, kind, x, y):
        self.browser._websocket_request('Input.dispatchMouseEvent', params={
            'type': kind, 'x': x, 'y': y, 'button': 'none' if kind == 'mouseMoved' else 'left',
            'buttons': 0 if kind == 'mouseReleased' else 1, 'clickCount': 1,
        })

    def _touch(self, kind, x, y):
        points = [] if kind == 'touchEnd' else [{'x': x, 'y': y}]
        self.browser._websocket_request('Input.dispatchTouchEvent', params={
            'type': kind, 'touchPoints': points,
        })

    def _centre(self, index):
        box = self.rect(TILES, index)
        return box['x'] + box['width'] / 2, box['y'] + box['height'] / 2

    def _home(self):
        self.browser.navigate_to(self.base_url() + '/odoo', wait_stop=False)
        self.wait(f"!!document.querySelector('{TILES}[data-menu-xmlid]')")
        self.wait("document.readyState === 'complete'")
        time.sleep(.3)

    def _order(self):
        return self.js(
            f"[...document.querySelectorAll('{TILES}')].map((el) => el.dataset.menuXmlid)")

    def _assert_still_home(self, order):
        time.sleep(.8)
        self.assertTrue(self.js("!!document.querySelector('.o_home_menu')"), 'the app opened')
        self.assertEqual(self.js('location.pathname'), '/odoo')
        self.assertEqual(self.js("document.querySelectorAll('.o_dragged_app').length"), 0)
        self.assertEqual(self._order(), order, 'the tile order changed')

    def _assert_opened(self):
        self.wait("!document.querySelector('.o_home_menu')")

    # -- scenarios ------------------------------------------------------------------

    def test_A101_A118_early_move_tour(self):
        settings = self.env['res.users.settings']._find_or_create_for_user(
            self.env['res.users'].search([('login', '=', 'admin')], limit=1))
        with self.page('/odoo'):
            self.wait(f"document.querySelectorAll('{TILES}[data-menu-xmlid]').length >= 2")
            order = self._order()
            x, y = self._centre(0)
            # A101: 30 px away within 0.1 s, back over the tile, released before 0.5 s
            self._mouse('mouseMoved', x, y)
            self._mouse('mousePressed', x, y)
            time.sleep(.05)
            self._mouse('mouseMoved', x + 30, y)
            time.sleep(.05)
            self._mouse('mouseMoved', x, y)
            time.sleep(.05)
            self._mouse('mouseReleased', x, y)
            self._assert_still_home(order)
            self.assertFalse(settings.invalidate_recordset() or settings.homemenu_config)
            # A118: the same early move released over another tile
            self._home()
            x2, y2 = self._centre(1)
            self._mouse('mousePressed', x, y)
            time.sleep(.05)
            self._mouse('mouseMoved', x + 30, y)
            time.sleep(.05)
            self._mouse('mouseMoved', x2, y2)
            self._mouse('mouseReleased', x2, y2)
            self._assert_still_home(order)
            # A118: the next click, after the 0.8 s settle above, opens the clicked application
            # (the click within the 400 ms grace is covered by the Hoot tests)
            self._mouse('mouseMoved', x2, y2)
            self._mouse('mousePressed', x2, y2)
            self._mouse('mouseReleased', x2, y2)
            self._assert_opened()
            # A118: a press that moves only 5 px before the release opens the application
            self._home()
            self._mouse('mouseMoved', x, y)
            self._mouse('mousePressed', x, y)
            time.sleep(.05)
            self._mouse('mouseMoved', x + 5, y)
            self._mouse('mouseReleased', x + 5, y)
            self._assert_opened()

    def test_A102_touch_slide_then_lift(self):
        with self.page('/odoo', touch=True, size=(390, 844)):
            self.wait(f"document.querySelectorAll('{TILES}[data-menu-xmlid]').length >= 1")
            order = self._order()
            x, y = self._centre(0)
            self._touch('touchStart', x, y)
            time.sleep(.05)
            self._touch('touchMove', x + 15, y)
            time.sleep(.05)
            self._touch('touchMove', x, y)
            self._touch('touchEnd', x, y)
            self._assert_still_home(order)
            # a plain tap on the same tile still opens it
            self._home()
            x, y = self._centre(0)
            self._touch('touchStart', x, y)
            self._touch('touchEnd', x, y)
            self._assert_opened()


def make_decisions_app(env):
    """An application whose list shows one partner (path ``cws-decisions``)."""
    env['res.partner'].create({'name': 'Decision Alpha'})
    action = env['ir.actions.act_window'].create({
        'name': 'Decision Partners', 'res_model': 'res.partner',
        'view_mode': 'list,form', 'path': 'cws-decisions',
    })
    menu = env['ir.ui.menu'].create({
        'name': 'Decision Partners', 'sequence': 9001,
        'action': f'ir.actions.act_window,{action.id}',
    })
    env['ir.model.data'].create({
        'module': 'cws_theme', 'name': 'menu_decisions', 'model': 'ir.ui.menu',
        'res_id': menu.id,
    })


def make_sections_app(env):
    """An application (path ``cws-sections``) whose top bar has one section menu with two items."""
    action = env['ir.actions.act_window'].create({
        'name': 'Section Partners', 'res_model': 'res.partner',
        'view_mode': 'list,form', 'path': 'cws-sections',
    })
    root = env['ir.ui.menu'].create({
        'name': 'Section App', 'sequence': 9002,
        'action': f'ir.actions.act_window,{action.id}',
    })
    group = env['ir.ui.menu'].create({'name': 'Section Group', 'parent_id': root.id})
    for name in ('Section One', 'Section Two'):
        env['ir.ui.menu'].create({
            'name': name, 'parent_id': group.id,
            'action': f'ir.actions.act_window,{action.id}',
        })


@tagged('post_install', '-at_install')
class TestThemeAppsMenuStep(HttpCase):
    """A103, A105, A106: the Community apps-menu tour step keeps the home menu."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        make_decisions_app(cls.env)

    def test_A103_step_after_app_name_click(self):
        self.start_tour(
            '/odoo/cws-decisions', 'web_theme_A103_step_after_app_name_click', login='admin')

        self.start_tour(
            '/odoo/cws-decisions', 'web_theme_A103_step_right_after_click', login='admin')

    def test_A105_step_from_inside_app(self):
        self.start_tour(
            '/odoo/cws-decisions', 'web_theme_A105_step_from_inside_app', login='admin')

    def test_A106_step_on_empty_home_menu(self):
        self.start_tour('/odoo', 'web_theme_A106_step_on_empty_home_menu', login='admin')


@tagged('post_install', '-at_install')
class TestThemeInteractiveAppsStep(ThemeProbeCase):
    """A133: an interactive tour that begins with the apps-menu step."""

    POINTERS = '''
        window.__cwsSeen = [];
        const timer = setInterval(() => {
            const module = odoo.loader.modules.get('@web_tour/tour_pointer/tour_pointer');
            const target = module && module.pointerState.trigger;
            const last = window.__cwsSeen.at(-1);
            if (target && (!last || last.el !== target)) {
                window.__cwsSeen.push({
                    el: target,
                    tile: target.matches(%(tile)r),
                    grid: target.matches('.o_navbar_apps_menu button'),
                    body: target === document.body,
                    home: !!document.querySelector('.o_home_menu'),
                    content: String(module.pointerState.content || ''),
                });
            }
        }, 5);
        window.__cwsStop = () => clearInterval(timer);
        odoo.startTour(%(name)r, {mode: 'manual', redirect: false});
    '''

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        make_decisions_app(cls.env)
        make_sections_app(cls.env)

    def _first_pointers(self, url, tour, ready):
        with self.page(url):
            self.wait(ready)
            self.js(self.POINTERS % {'tile': TILE, 'name': tour})
            self.wait('window.__cwsSeen.length > 0')
            time.sleep(1)  # a pointer shown for the skipped step would have been seen by now
            seen = self.js(
                'window.__cwsStop(), window.__cwsSeen.map((p) => ({...p, el: undefined}))')
        return seen

    def _assert_tile_first(self, seen):
        self.assertTrue(seen[0]['tile'], f'the first pointer is not on the tile: {seen}')
        self.assertTrue(seen[0]['content'], 'the tile pointer has no text')
        for pointer in seen:
            self.assertFalse(pointer['body'] or pointer['grid'], f'unexpected pointer: {seen}')
            self.assertTrue(pointer['content'], f'a pointer without text: {seen}')

    def test_A133_interactive_start_on_home_menu(self):
        seen = self._first_pointers(
            '/odoo', 'web_theme_A133_interactive_start', f'!!document.querySelector({TILE!r})')
        self._assert_tile_first(seen)

    def test_A133_interactive_start_inside_application(self):
        seen = self._first_pointers(
            '/odoo/cws-decisions', 'web_theme_A133_interactive_start',
            '!!document.querySelector(".o_list_view .o_data_row")')
        self.assertTrue(seen[0]['grid'], f'the first pointer is not on the grid button: {seen}')
        self.assertTrue(seen[0]['content'], f'the grid button pointer has no text: {seen}')

    def _click(self, selector):
        self.pointer_to(selector)
        box = self.rect(selector)
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        for kind in ('mousePressed', 'mouseReleased'):
            self.browser._websocket_request('Input.dispatchMouseEvent', params={
                'type': kind, 'x': x, 'y': y, 'button': 'left', 'clickCount': 1,
                'buttons': 1 if kind == 'mousePressed' else 0,
            })

    def test_A133_interactive_after_app_name_click(self):
        """The name is clicked for real, the apps-menu step turns inactive: the tour goes on."""
        brand = '.o_navbar .o_menu_toggle .o_menu_brand'
        with self.page('/odoo/cws-decisions'):
            self.wait('!!document.querySelector(".o_list_view .o_data_row")')
            self.js(self.POINTERS % {
                'tile': TILE, 'name': 'web_theme_A133_interactive_after_name_click'})
            self.wait('window.__cwsSeen.length > 0')
            self.assertEqual(self.js('window.__cwsSeen.at(-1).content'), 'name text')
            self._click(brand)
            self.wait('window.__cwsSeen.some((p) => p.tile)')
            self.js(f'document.querySelector({TILE!r}).click()')
            self.wait(
                "!odoo.loader.modules.get('@web_tour/tour_state').tourState.getCurrentTour()"
                " && !!document.querySelector('.o_list_view .o_data_row')"
                " && !document.querySelector('.o_home_menu')")
            seen = self.js(
                'window.__cwsStop(), window.__cwsSeen.map((p) => ({...p, el: undefined}))')
        # the grid button may be pointed at, with its text, until the home menu is drawn
        for pointer in seen:
            self.assertTrue(pointer['content'], f'a pointer without text: {seen}')
            self.assertFalse(pointer['body'], f'unexpected pointer: {seen}')
        shown = [pointer for pointer in seen if pointer['home']]
        self.assertTrue(shown, f'no pointer on the home menu: {seen}')
        self.assertFalse(any(p['grid'] for p in shown), f'grid pointer on the home menu: {seen}')
        self.assertTrue(shown[0]['tile'], f'the first pointer on the home menu: {seen}')
        self.assertEqual(
            [p['content'] for p in seen if p['tile']], ['tile text'], f'tile pointer: {seen}')

    # -- A136 (D10): no other step of any tour is changed -------------------------

    STATE = """({
        index: odoo.loader.modules.get('@web_tour/tour_state').tourState.getCurrentIndex(),
        running: !!odoo.loader.modules.get('@web_tour/tour_state').tourState.getCurrentTour(),
        menu: !!document.querySelector('.o-dropdown--menu'),
        errors: window.__cwsErrors.length,
        texts: window.__cwsSeen.map((p) => p.content),
    })"""

    def _section_tour(self, url, ready, tour, toggle):
        """Open the menu, reach the second step, close the menu with Escape; return the state
        reached with the menu open and the state a moment after it closed."""
        with self.page(url):
            self.wait(ready)
            self.js('window.__cwsErrors = []; addEventListener("error", (e) => '
                    'window.__cwsErrors.push(String(e.message)))')
            self.js(self.POINTERS % {'tile': TILE, 'name': tour})
            self._click(toggle)
            self.wait("!!document.querySelector('.o-dropdown--menu')")
            # the second step is current and points at the item, with its text
            self.wait("window.__cwsSeen.some((p) => p.content === 'item text')")
            before = self.js(self.STATE)
            self.key('Escape')
            self.wait("!document.querySelector('.o-dropdown--menu')")
            time.sleep(1)
            after = self.js(self.STATE)
            self.js('window.__cwsStop()')
        return before, after

    def _assert_community_outcome(self, before, after):
        # Community runner (observed with the narrowed patch in place, and derived from reading
        # the engine): the second step stays the current one and waits when the menu closes; it
        # does not move on to the third step. The runner of the earlier rounds ended on index 2
        # with the third step's pointer.
        self.assertEqual(before['index'], 1, before)
        self.assertEqual(after['errors'], 0, f'a page error occurred: {after}')
        self.assertEqual(after['index'], 1, f'the tour left the second step: {before} {after}')
        self.assertTrue(after['running'], after)
        self.assertFalse(after['menu'], after)
        self.assertNotIn('third text', after['texts'], f'a skip forward: {after}')

    def test_A136_section_menu_closed_with_escape(self):
        before, after = self._section_tour(
            '/odoo/cws-sections', '!!document.querySelector(".o_menu_sections .dropdown-toggle")',
            'web_theme_A136_section_menu',
            '.o_menu_sections .dropdown-toggle')
        self._assert_community_outcome(before, after)

    def test_A136_crm_sales_menu_closed_with_escape(self):
        if 'crm.lead' not in self.env:
            self.skipTest('crm is not installed')
        before, after = self._section_tour(
            '/odoo/action-crm.crm_lead_action_pipeline',
            '!!document.querySelector(".o_menu_sections .dropdown-toggle")',
            'web_theme_A136_crm_sales_menu',
            '.o_menu_sections .dropdown-toggle')
        self._assert_community_outcome(before, after)

    def test_A136_crm_tour_inside_application(self):
        """The Community CRM tour, started inside CRM: the pointers after the first are the ones
        of the Community runner (the tile, with the step's text)."""
        if 'crm.lead' not in self.env:
            self.skipTest('crm is not installed')
        grid = '.o_navbar_apps_menu button'
        with self.page('/odoo/action-crm.crm_lead_action_pipeline'):
            self.wait('!!document.querySelector(".o_opportunity_kanban .o_kanban_renderer")')
            self.js(self.POINTERS % {'tile': CRM_TILE, 'name': 'crm_tour'})
            self.wait('window.__cwsSeen.length > 0')
            self.assertTrue(self.js('window.__cwsSeen[0].grid'))
            self._click(grid)
            self.wait('window.__cwsSeen.some((p) => p.home && p.content)')
            time.sleep(.5)
            seen = self.js(
                'window.__cwsStop(), window.__cwsSeen.map((p) => ({...p, el: undefined}))')
            # stop here: the next step opens the application, the ones after create data
            self.js("odoo.loader.modules.get('@web_tour/tour_state').tourState.clear()")
        for pointer in seen:
            self.assertTrue(pointer['content'], f'a pointer without text: {seen}')
            self.assertFalse(pointer['body'], f'a pointer on the page: {seen}')
        after = [p for p in seen[1:] if p['home']]
        self.assertTrue(after, f'no pointer on the home menu: {seen}')
        self.assertTrue(any(p['tile'] for p in after), f'no tile pointer on the home menu: {seen}')
        self.assertFalse(any(p['grid'] for p in after), f'a grid pointer on the home menu: {seen}')

    def test_A133_crm_tour_on_home_menu(self):
        if 'crm.lead' not in self.env:
            self.skipTest('crm is not installed')
        seen = self._first_pointers(
            '/odoo', 'crm_tour', '!!document.querySelector(".o_home_menu .o_app")')
        self.assertTrue(seen[0]['content'], f'the first pointer has no text: {seen}')
        self.assertFalse(seen[0]['body'] or seen[0]['grid'], f'unexpected pointer: {seen}')


_ExpenseBase = expense_common.TestExpenseCommon if expense_common else HttpCase


@tagged('post_install', '-at_install')
class TestThemeExpenseTour(_ExpenseBase, HttpCase):
    """A104: the Community expenses tour passes ten times in a row."""

    browser_size = '1920,1080'

    @classmethod
    def setUpClass(cls):
        if expense_common is None or 'hr.expense' not in Registry(get_db_name()):
            raise SkipTest('hr_expense is not installed')
        super().setUpClass()

    def test_A104_expense_tour_ten_times(self):
        # The setup below is adapted from the Community hr_expense UI test (LGPL-3).
        employee_1 = self.expense_employee
        employee_2 = self.env['hr.employee'].sudo().create({'name': 'employee2'})
        expense = self.env['hr.expense'].create({
            'name': 'expense_for_tour_0',
            'employee_id': employee_2.id,
            'product_id': self.product_c.id,
            'total_amount': 1,
        })
        for run in range(10):
            expense.employee_id = employee_2
            self.start_tour(
                '/odoo', 'create_expense_no_employee_access_tour',
                login=self.expense_user_manager.login,
            )
            self.assertEqual(expense.employee_id.id, employee_1.id, f'run {run + 1}')
