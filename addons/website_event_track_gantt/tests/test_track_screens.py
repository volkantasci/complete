# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of the tracks Gantt bridge, taken on demand (not part of the normal run).

One capture per screen S1 to S8 of the spec's ``screens/index.md`` of slice 002d (light: no
suffix, dark: ``-dark``, phone: ``.mobile``). Run with ``--test-tags
website_event_track_gantt_screens`` and ``--screenshots /mnt/cwg_shots`` on a database that has
``web_enterprise`` (for the dark scheme), with the git-ignored ``.cache/screens_002d`` of the
checkout mounted there; the files land in ``.cache/screens_002d/event_track_gantt/`` and are
copied into ``docs/assets/event_track_gantt/``. The paths are those of the probes of
``test_track_probes`` (A53's path on the phone); S5 is taken as the Event Organizer, whose footer
is Complete's own (decision D3). The browser clock is Tuesday 11 June 2030 09:00 (UTC+3).
"""
import base64
import logging
import pathlib

import odoo
from odoo.addons.test_web_gantt.tests.timeline_probe import TimelineProbeCase
from odoo.tests import HttpCase, tagged

from . import test_track_probes as probes
from .track_fixtures import make_event_users, make_gantt_summit

_logger = logging.getLogger(__name__)

BOTH = ('desktop', 'phone')
DESKTOP = ('desktop',)
FOLDER = 'event_track_gantt'


@tagged('-standard', 'website_event_track_gantt_screens', 'post_install', '-at_install')
class TestTrackScreens(TimelineProbeCase):

    # the paths of the probes, reused as they are
    open = probes.TestTrackProbes.open
    tap = probes.TestTrackProbes.tap
    open_tracks = probes.TestTrackProbes.open_tracks
    show_gantt = probes.TestTrackProbes.show_gantt
    open_popover = probes.TestTrackProbes.open_popover
    real_click = probes.TestTrackProbes.real_click

    @classmethod
    def setUpClass(cls):
        HttpCase.setUpClass.__func__(cls)
        cls.has_theme = bool(cls.env['ir.module.module'].search_count(
            [('name', '=', 'web_enterprise'), ('state', '=', 'installed')]))
        manager_group = cls.env.ref('event.group_event_manager')
        admin = cls.env.ref('base.user_admin')
        admin.write({'group_ids': [(4, manager_group.id)]})
        make_event_users(cls.env)
        cls.summit = make_gantt_summit(cls.env)
        # the screens show the administrator as the demo data names it, as the tracks' responsible
        admin.partner_id.name = 'Mitchell Admin'
        for track in cls.summit['tracks'].values():
            track.user_id = admin
        cls.env.flush_all()

    def snap(self, name):
        """Wait for animations to settle, then store the viewport as ``name``."""
        self.settle(900)
        res = self.browser._websocket_request('Page.captureScreenshot')
        folder = pathlib.Path(odoo.tools.config['screenshots']) / FOLDER
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(base64.b64decode(res['data']))

    def each(self, prepare, viewports=BOTH, action=probes.EVENTS, query='', login='admin',
             ready='.o_kanban_view .o_kanban_record'):
        """Run ``prepare(viewport, shot)`` once per variant; ``shot(stem)`` stores the viewport
        as the variant's file of ``stem``. A variant that fails is logged and the next one still
        runs; the test fails at the end."""
        errors = []
        for scheme in ('light', 'dark'):
            if scheme == 'dark' and not self.has_theme:
                continue
            for viewport in viewports:
                suffix = ('-dark' if scheme == 'dark' else '') \
                    + ('.mobile' if viewport == 'phone' else '') + '.png'
                taken = []

                def shot(stem, suffix=suffix, taken=taken):
                    taken.append(stem)
                    self.snap(stem + suffix)

                try:
                    with self.page(action, scheme, viewport, query=query, login=login,
                                   clock=probes.CLOCK, ready=ready):
                        prepare(viewport, shot)
                except Exception as error:  # noqa: BLE001 - keep capturing the other variants
                    _logger.error('screens %s%s failed: %s', taken, suffix, error)
                    try:
                        self.snap('failed-' + suffix)
                    except Exception:  # noqa: BLE001
                        _logger.exception('no failure capture for %s', suffix)
                    errors.append(f'{taken}{suffix}: {error}')
        self.assertFalse(errors, '\n'.join(errors))

    def dialog_of(self, name):
        """The popover of a pill, its Edit button, and the record dialog drawn."""
        self.open_popover(name)
        self.tap("document.querySelector('.o_tl_popover_button')")
        self.wait("document.querySelectorAll('.o_dialog .modal-footer button').length > 1",
                  timeout=30)
        self.settle(700)

    # -- S1: the tracks Gantt view from the event (01) --------------------------------------------

    def test_s01_gantt(self):
        def prepare(viewport, shot):
            self.open_tracks(phone=viewport == 'phone')
            self.pointer_away()
            shot('01-gantt')
        self.each(prepare)

    # -- S2, S3: the popovers (02, 03) ------------------------------------------------------------

    def test_s02_popover(self):
        def prepare(viewport, shot):
            self.open_tracks(phone=viewport == 'phone')
            self.open_popover('Opening Keynote' if viewport == 'phone' else 'Wood Joinery')
            shot('02-popover')
        self.each(prepare)

    def test_s03_popover_nospeaker(self):
        def prepare(viewport, shot):
            self.open_tracks()
            self.open_popover('Panel Talk')
            shot('03-popover-nospeaker')
        self.each(prepare, viewports=DESKTOP)

    # -- S4, S5: the record dialog, the administrator and an Events User (04, 05) -----------------

    def test_s04_dialog(self):
        def prepare(viewport, shot):
            self.open_tracks()
            self.dialog_of('Panel Talk')
            shot('04-dialog')
        self.each(prepare, viewports=DESKTOP)

    def test_s05_dialog_user(self):
        def prepare(viewport, shot):
            self.open_tracks()
            self.dialog_of('Panel Talk')
            shot('05-dialog-user')
        self.each(prepare, viewports=DESKTOP, login='evuser')

    # -- S6: the new track's dialog (06) ----------------------------------------------------------

    def test_s06_new_dialog(self):
        def prepare(viewport, shot):
            self.open_tracks()
            self.tap("document.querySelector('.o_tl_button_add')")
            self.wait("!!document.querySelector('.o_dialog .o_form_button_save')", timeout=30)
            self.settle(700)
            shot('06-new-dialog')
        self.each(prepare, viewports=DESKTOP)

    # -- S7: the delete confirmation (07) ---------------------------------------------------------

    def test_s07_delete_confirm(self):
        def prepare(viewport, shot):
            self.open_tracks()
            self.dialog_of('Panel Talk')
            self.real_click("document.querySelector('.o_dialog .o_track_delete')")
            self.wait("document.querySelectorAll('.o_dialog').length === 2", timeout=30)
            self.settle(700)
            shot('07-delete-confirm')
        self.each(prepare, viewports=DESKTOP)

    # -- S8: the view from the menu, year range (08) ----------------------------------------------

    def test_s08_year(self):
        def prepare(viewport, shot):
            if viewport == 'phone':
                self.show_gantt(phone=True)
            else:
                self.wait("document.querySelectorAll('.o_tl_pill').length > 0", timeout=60)
                self.settle()
            self.pointer_away()
            shot('08-year')
        self.each(prepare, viewports=DESKTOP, action=probes.TRACKS_MENU,
                  query='?debug=1&view_type=gantt', ready='.o_tl_renderer .o_tl_row')
        self.each(prepare, viewports=('phone',), action=probes.TRACKS_MENU, query='?debug=1')
