# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the tracks Gantt view (slice 002d): the event's Tracks button, the menu, the
popover and the first day. The browser clock is Tuesday 11 June 2030 09:00 (UTC+3) and the browser
zone ``Etc/GMT-3`` unless a scenario names another; every record is created by the test and the
scenarios that change a record restore it."""
from datetime import datetime

from odoo.addons.test_web_gantt.tests.timeline_real_pointer import RealPointerMixin
from odoo.tests import HttpCase, tagged

from .track_fixtures import make_event_users, make_gantt_summit, make_tz_events

EVENTS = '/odoo/action-event.action_event_view'
NOW = datetime(2030, 6, 11, 6, 0)
ZONE = 'Etc/GMT-3'


@tagged('post_install', '-at_install')
class TestTrackTours(RealPointerMixin, HttpCase):

    def setUp(self):
        super().setUp()
        self.browser_size = '1600x900'
        self.touch_enabled = False
        self.admin = self.env.ref('base.user_admin')
        self.admin.lang = 'en_US'
        self.admin.group_ids = [(4, self.env.ref('event.group_event_manager').id)]
        make_event_users(self.env)
        self.summit = make_gantt_summit(self.env)

    # -- helpers --------------------------------------------------------------------------------

    def _tour(self, path, name, timezone=ZONE, now=NOW, login='admin'):
        self.start_tour_with_pointer(path, name, now=now, timezone=timezone, login=login)

    def _demo_event(self, name, begin, end, tracks=()):
        """The demo event of that name, or a stand-in of the same shape (ruling O-2)."""
        event = self.env['event.event'].search([('name', '=', name)], limit=1)
        if event:
            return event
        event = self.env['event.event'].create({
            'name': name, 'date_begin': begin, 'date_end': end, 'date_tz': 'Europe/Brussels',
        })
        locations = {}
        for track, start, speaker, location in tracks:
            if location and location not in locations:
                locations[location] = self.env['event.track.location'].create({'name': location})
            place = locations[location].id if location else False
            self.env['event.track'].create({
                'name': track, 'event_id': event.id, 'date': start, 'duration': 1.0,
                'partner_name': speaker, 'location_id': place,
            })
        return event

    # -- the Tracks button and the menu ---------------------------------------------------------

    def test_a30_tracks_button_week(self):
        self._tour(EVENTS, 'track_a30_tracks_button_week')

    def test_a29_menu_year(self):
        self._tour(f'{EVENTS}?debug=1', 'track_a29_menu_year')

    def test_a52_menu_only_in_debug(self):
        self._tour(EVENTS, 'track_a52_without_debug')
        self._tour(f'{EVENTS}?debug=1', 'track_a52_with_debug')

    # -- the first day --------------------------------------------------------------------------

    def test_a34_first_day_in_browser_zone(self):
        make_tz_events(self.env)
        self.admin.tz = 'Europe/Brussels'
        self._tour(EVENTS, 'track_a34_tz_east', timezone='Europe/Istanbul')
        self._tour(EVENTS, 'track_a34_tz_west_midday', timezone='America/Los_Angeles')
        self._tour(EVENTS, 'track_a34_tz_west_late', timezone='America/Los_Angeles')

    def test_a36_without_button_context(self):
        event = self.summit['event']
        self._tour(
            f'/odoo/{event.id}/action-website_event_track.action_event_track_from_event'
            '?view_type=gantt',
            'track_a36_without_button_context')

    def test_track_focus_dirty_form(self):
        event = self.env['event.event'].create({
            'name': 'Dirty Form Event',
            'date_begin': datetime(2030, 6, 10, 6, 0),
            'date_end': datetime(2030, 6, 10, 15, 0),
        })
        self._tour(EVENTS, 'track_focus_dirty_form')
        # the shown 23:00 (UTC+3) of 9 June was saved; restore the event's start
        self.assertEqual(event.date_begin, datetime(2030, 6, 9, 20, 0))
        event.date_begin = datetime(2030, 6, 10, 6, 0)

    # -- rows, pills and the popover ------------------------------------------------------------

    def test_a37_rows_and_pills(self):
        self._tour(EVENTS, 'track_a37_rows_and_pills')

    def test_a37_colour_zero_is_grey_in_dark(self):
        if not self.env['ir.module.module'].search_count(
                [('name', '=', 'web_enterprise'), ('state', '=', 'installed')]):
            self.skipTest('the dark scheme needs web_enterprise, which is not installed')
        event = self.summit['event']
        self.env['event.track'].create({
            'name': 'Grey Track', 'event_id': event.id, 'color': 0,
            'date': datetime(2030, 6, 11, 7, 0), 'duration': 1.0,
            'location_id': self.summit['tracks']['Panel Talk'].location_id.id,
        })
        self.env['res.users.settings']._find_or_create_for_user(self.admin).color_scheme = 'dark'
        self._tour(EVENTS, 'track_a37_grey_in_dark')

    def test_a38_popover_with_speaker(self):
        self._tour(EVENTS, 'track_a38_popover_with_speaker')

    def test_a39_popover_without_speaker(self):
        self._tour(EVENTS, 'track_a39_popover_without_speaker')

    # -- demo events ----------------------------------------------------------------------------

    def test_a54_event_without_tracks(self):
        self._demo_event('Conference for Architects',
                         datetime(2030, 6, 11, 7, 0), datetime(2030, 6, 11, 15, 0))
        self._tour(EVENTS, 'track_a54_event_without_tracks')

    def test_a55_demo_event(self):
        self._demo_event(
            'OpenWood Collection Online Reveal',
            datetime(2030, 6, 11, 7, 0), datetime(2030, 6, 13, 15, 0),
            tracks=[
                ('Easy Way To Build a Wooden House', datetime(2030, 6, 11, 8, 0), 'Joe Timber',
                 'Room A'),
                ('Lumber Basics', datetime(2030, 6, 12, 8, 0), 'Sam Plank', 'Room B'),
                ('Unplaced Talk', datetime(2030, 6, 12, 10, 0), False, False),
            ])
        self._tour(EVENTS, 'track_a55_demo_event')

    # -- the record dialog ----------------------------------------------------------------------

    def _track(self, name):
        return self.env['event.track'].search([('name', '=', name)], limit=1)

    def _popular_track(self):
        """A track two visitors wishlisted (stands in for the demo "First Day Wrapup")."""
        track = self.summit['tracks']['Opening Keynote']
        for index in range(2):
            visitor = self.env['website.visitor'].create({'access_token': f'{index:032x}'})
            self.env['event.track.visitor'].create({
                'track_id': track.id, 'visitor_id': visitor.id, 'is_wishlisted': True})
        track.invalidate_recordset()
        self.assertEqual(track.wishlist_visitor_count, 2)

    def test_a41_admin_footer(self):
        self._tour(EVENTS, 'track_a41_admin_footer')
        self.assertEqual(self._track('Wood Joinery').name, 'Wood Joinery')

    def test_a42_dialog_form(self):
        self._popular_track()
        self._tour(EVENTS, 'track_a42_dialog_form')

    def test_a43_save_and_discard(self):
        self._tour(EVENTS, 'track_a43_save_and_discard')
        track = self._track('Wood Joinery 2')
        self.assertTrue(track)
        self.assertFalse(self._track('Dropped Name'))
        track.name = 'Wood Joinery'

    def test_a44_unschedule(self):
        track = self.summit['tracks']['Panel Talk']
        self._tour(EVENTS, 'track_a44_unschedule')
        track.invalidate_recordset()
        self.assertFalse(track.date)
        self.assertFalse(track.date_end)
        self.assertEqual(track.duration, 5.0)

    def test_a46_delete_confirmed(self):
        track = self.summit['tracks']['Panel Talk']
        self._tour(EVENTS, 'track_a46_delete_confirmed')
        self.assertFalse(track.exists())

    def test_a47_delete_discarded(self):
        track = self.summit['tracks']['Panel Talk']
        self._tour(EVENTS, 'track_a47_delete_discarded')
        self.assertTrue(track.exists())
        self.assertEqual(track.name, 'Panel Talk')

    def test_a48_new_dialog(self):
        self._tour(EVENTS, 'track_a48_new_dialog')
        self.assertTrue(self._track('Fresh Track'))
        self._track('Fresh Track').unlink()

    def test_a48_new_dialog_organizer(self):
        self._tour(EVENTS, 'track_a48_new_dialog_organizer', login='evuser')
        track = self._track('Organizer Track')
        self.assertTrue(track)
        track.unlink()

    def test_a49_events_user(self):
        track = self.summit['tracks']['Panel Talk']
        self._tour(EVENTS, 'track_a49_events_user', login='evuser')
        track.invalidate_recordset()
        self.assertEqual(track.name, 'Panel Talk 2')
        self.assertFalse(track.date)
        self.assertEqual(track.duration, 4.0)

    def test_a49_events_user_drag(self):
        track = self.summit['tracks']['Panel Talk']
        self._tour(EVENTS, 'track_a49_events_user_drag', login='evuser')
        track.invalidate_recordset()
        self.assertEqual(track.date, datetime(2030, 6, 12, 8, 0))

    def test_a50_registration_desk(self):
        track = self.summit['tracks']['Panel Talk']
        self._tour(EVENTS, 'track_a50_registration_desk', login='evdesk')
        track.invalidate_recordset()
        self.assertEqual(track.date, datetime(2030, 6, 11, 8, 0))

    def test_a56_refused_write(self):
        self._tour(EVENTS, 'track_a56_refused_move')
        self.assertFalse(self._track('Panel Talk'))

    def test_a56_refused_unschedule(self):
        self._tour(EVENTS, 'track_a56_refused_unschedule')
        self.assertFalse(self._track('Panel Talk'))

    def test_track_dialog_invalid_form(self):
        track = self.summit['tracks']['Wood Joinery']
        self._tour(EVENTS, 'track_dialog_invalid_form')
        track.invalidate_recordset()
        self.assertTrue(track.exists())
        self.assertEqual(track.date, datetime(2030, 6, 10, 9, 0))
