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
            # A118: the next click, at once, opens the clicked application
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


@tagged('post_install', '-at_install')
class TestThemeAppsMenuStep(HttpCase):
    """A103, A105, A106: the Community apps-menu tour step keeps the home menu."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env['res.partner'].create({'name': 'Decision Alpha'})
        action = cls.env['ir.actions.act_window'].create({
            'name': 'Decision Partners', 'res_model': 'res.partner',
            'view_mode': 'list,form', 'path': 'cws-decisions',
        })
        menu = cls.env['ir.ui.menu'].create({
            'name': 'Decision Partners', 'sequence': 9001,
            'action': f'ir.actions.act_window,{action.id}',
        })
        cls.env['ir.model.data'].create({
            'module': 'cws_theme', 'name': 'menu_decisions', 'model': 'ir.ui.menu',
            'res_id': menu.id,
        })

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
