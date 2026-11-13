# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of the Gantt view's editing interface, taken on demand (not part of the normal run).

One capture per screen of the spec's ``screens/index.md`` of slice 002b (names 20 to 32 of
``gantt_view``; light: no suffix, dark: ``-dark``, phone: ``.mobile``). Run with
``--test-tags gantt_edit_screens`` and ``--screenshots <dir>`` on a database that has
``web_enterprise`` (for the dark scheme); the files land in ``<dir>/gantt_view/``.
"""
import logging
import time

from odoo import Command
from odoo.tests import tagged

from . import test_edit_probes as probes
from . import test_screens as screens
from .timeline_probe import TimelineProbeCase

_logger = logging.getLogger(__name__)

HOST = 'test_web_gantt.host_action_{}'
BOTH = ('desktop', 'phone')
DESKTOP = ('desktop',)
RESTRICTED = 'restricted_viewer'
Edit = probes.TimelineEditProbes


@tagged('-standard', 'gantt_edit_screens', 'post_install', '-at_install')
class TimelineEditScreens(TimelineProbeCase):

    # the helpers of the probes and of 002a's screens, reused as they are
    snap = screens.TimelineScreens.snap
    mouse = Edit.mouse
    touch_event = Edit.touch_event
    box = Edit.box
    wait_for = Edit.wait_for
    target_points = Edit.target_points
    hold_mouse = Edit.hold_mouse
    release_mouse = Edit.release_mouse
    click_at = Edit.click_at
    open_edit = Edit.open_edit
    open_range_menu = screens.TimelineScreens.open_range_menu
    choose_range = screens.TimelineScreens.choose_range

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env['res.users'].create({
            'name': 'Restricted viewer',
            'login': RESTRICTED,
            'password': RESTRICTED,
            'group_ids': [Command.set([cls.env.ref('base.group_user').id])],
        })

    # -- plumbing -------------------------------------------------------------------

    def each(self, stem, host, prepare, viewports=BOTH, login='admin'):
        """Capture ``stem`` for every variant; ``prepare(viewport)`` sets the state up."""
        errors = []
        for scheme in ('light', 'dark'):
            if scheme == 'dark' and not self.has_theme:
                continue
            for viewport in viewports:
                name = (stem + ('-dark' if scheme == 'dark' else '')
                        + ('.mobile' if viewport == 'phone' else '') + '.png')
                user = self.env['res.users'].search([('login', '=', login)], limit=1)
                self.env['res.users.settings']._find_or_create_for_user(user).color_scheme = scheme
                try:
                    with self.page(HOST.format(host), scheme, viewport, login=login):
                        prepare(viewport)
                        self.snap(name)
                except Exception as error:  # noqa: BLE001 - keep capturing the other variants
                    _logger.error('screen %s failed: %s', name, error)
                    try:
                        self.snap('failed-' + name)
                    except Exception:  # noqa: BLE001
                        _logger.exception('no failure capture for %s', name)
                    errors.append(f'{name}: {error}')
        self.assertFalse(errors, '\n'.join(errors))

    def touch_hold(self, release=False):
        """Long press at x 160 on the empty bottom of the row, then move to x 230, where nothing
        scrolls (M9); optionally lift."""
        x0, y, x1 = 160, 405, 230
        self.touch_event('touchStart', [(x0, y)])
        time.sleep(.7)
        for i in range(1, 9):
            self.touch_event('touchMove', [(x0 + (x1 - x0) * i / 8, y)])
            time.sleep(.03)
        self.wait("!!document.querySelector('.o_tl_selection')")
        self.settle()
        if release:
            self.touch_event('touchEnd', [])
            self.settle(500)

    def select(self, viewport, release):
        """The selection gesture of the screens: a held mouse, or a long press on the phone."""
        if viewport == 'phone':
            self.touch_hold(release)
            return
        x0, y, x1 = self.target_points(7, 9)
        self.hold_mouse(x0, y, x1)
        if release:
            self.release_mouse(x1, y)

    def dialog(self):
        self.wait_for("document.querySelector('.o_dialog .modal-dialog')")

    # -- S1 to S6 -------------------------------------------------------------------

    def test_s01_selecting(self):
        self.each('20-selecting', 'h1', lambda v: self.select(v, False))

    def test_s02_create_dialog(self):
        def prepare(viewport):
            self.select(viewport, True)
            self.dialog()
        self.each('21-create-dialog', 'h1', prepare)

    def test_s03_plan_dialog(self):
        def prepare(viewport):
            cell = f"{self.row('Beta')}.querySelector('.o_tl_cell[data-column=\"10\"]')"
            self.click_at(cell)
            self.wait_for("document.querySelector('.o_dialog .o_list_renderer, "
                          ".o_dialog .o_kanban_renderer, .o_dialog .o_select_button')")
            self.settle(600)
        self.each('22-plan-dialog', 'h2', prepare)

    def test_s04_popover_edit(self):
        self.each('23-popover-edit', 'h1', lambda v: self.open_edit('Build'))

    def edit_build(self):
        self.open_edit('Build')
        self.click_at("document.querySelector('.o_tl_popover_button')")
        self.wait_for("document.querySelector('.o_dialog .o_form_view')")
        self.settle(600)

    def test_s05_record_dialog(self):
        self.each('24-record-dialog', 'h1', lambda v: self.edit_build())

    def test_s06_delete_confirm(self):
        def prepare(viewport):
            self.edit_build()
            self.click_at("document.querySelector('.o_dialog .o_form_button_remove')")
            self.wait("document.querySelectorAll('.o_dialog').length === 2")
            self.settle(600)
        self.each('25-delete-confirm', 'h1', prepare)

    # -- S7 to S10 ------------------------------------------------------------------

    def test_s07_readonly_popover(self):
        self.each('26-readonly-popover', 'h19', lambda v: self.open_edit('Build'))

    def test_s08_readonly_dialog(self):
        self.each('27-readonly-dialog', 'h19', lambda v: self.edit_build())

    def test_s09_editable_popover(self):
        self.each('28-editable-popover', 'h24', lambda v: self.open_edit('Build'))

    def test_s10_restricted_user(self):
        self.each('29-restricted-user', 'h1', lambda v: self.open_edit('Build'),
                  login=RESTRICTED)

    # -- S11 to S13 -----------------------------------------------------------------

    def test_s11_create_action(self):
        def prepare(viewport):
            self.select(viewport, True)
            self.wait_for("document.querySelector('.o_form_view')")
            self.settle(600)
        self.each('30-create-action', 'h22', prepare, viewports=DESKTOP)

    def test_s12_new_week(self):
        def prepare(viewport):
            self.click_js("[...document.querySelectorAll('.o_control_panel .btn-primary')]"
                          ".find((b) => b.textContent.trim() === 'New')")
            self.dialog()
            self.settle(600)
        self.each('31-new-week', 'h1', prepare, viewports=DESKTOP)

    def test_s13_date_only_click(self):
        def prepare(viewport):
            self.choose_range('month', 'Month')
            column = self.js("document.querySelector('.o_tl_col[data-date=\"2026-11-16\"]')"
                             ".dataset.index")
            cell = f"document.querySelector('.o_tl_row .o_tl_cell[data-column=\"{column}\"]')"
            self.click_at(cell)
            self.dialog()
            self.settle(600)
        self.each('32-date-only-click', 'h25', prepare, viewports=DESKTOP)
