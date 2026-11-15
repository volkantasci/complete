# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of slice 002b3 (multi-selection, multi-creation and the side panel).

The browser inherits the time zone of the test process, pinned to UTC here, and the records are
built around the date of that zone with a zero offset, so the browser and the records agree on
what today is. A scenario that changes the database runs inside the test's own savepoint, which
is rolled back after it: every test starts from the records of `setUpClass`.

A tour that needs real pointer events asks for them through ``window.__tl_mouse`` (see
``timeline_real_pointer``).
"""
import functools
import os
import time
from datetime import datetime, timedelta
from datetime import time as clock
from unittest.mock import patch

from lxml import etree
from odoo import Command, fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import HttpCase, tagged

from .timeline_real_pointer import RealPointerMixin

HOST_ACTION = '/odoo/action-test_web_gantt.host_action_{}'
PILL = 'test.web.gantt.pill'
DESKTOP = '1600x900'
PHONE = '390x844'
RESTRICTED = 'restricted_editor'


@tagged('post_install', '-at_install')
class TestTimelineMultiTours(RealPointerMixin, HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        previous = os.environ.get('TZ')
        os.environ['TZ'] = 'UTC'
        time.tzset()

        def restore():
            if previous is None:
                os.environ.pop('TZ', None)
            else:
                os.environ['TZ'] = previous
            time.tzset()

        cls.addClassCleanup(restore)
        pill = cls.env[PILL]
        # the demo data (when loaded) holds the same records: start from a clean host
        pill.with_context(active_test=False).search([]).unlink()
        cls.env['test.web.gantt.pill2'].with_context(active_test=False).search([]).unlink()
        cls.today = fields.Date.today()
        cls.records = pill._tl_build_host_records(today=cls.today, tz_offset_hours=0)
        cls.rtl_user = pill._tl_rtl_user()
        cls.restricted = cls.env['res.users'].create({
            'name': 'Restricted editor',
            'login': RESTRICTED,
            'password': RESTRICTED,
            'group_ids': [Command.set([cls.env.ref('base.group_user').id])],
        })

    def setUp(self):
        super().setUp()
        self.browser_size = DESKTOP
        self.touch_enabled = False
        self.env.ref('base.user_admin').lang = 'en_US'

    # -- helpers --------------------------------------------------------------------------------

    def _tour(self, host, name, login='admin', size=DESKTOP, touch=False):
        self.browser_size = size
        self.touch_enabled = touch
        path = host if host.startswith('/') else HOST_ACTION.format(host)
        self.start_tour_with_pointer(path, name, login=login)

    # -- notes on the earlier parts (R1) ---------------------------------------------------------

    def test_a1_tour_group_header_gesture(self):
        count = self.env[PILL].search_count([])
        self._tour('h3', 'timeline_002b3_a1_group_header_gesture')
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_a2_tour_record_header(self):
        self._tour('h3', 'timeline_002b3_a2_record_header')

    def test_a2_tour_group_header_gesture_phone(self):
        self._tour('h3', 'timeline_002b3_a2_group_header_gesture_phone', size=PHONE)

    # -- selecting cells (R2 to R9, R15) ---------------------------------------------------------

    def test_a9_tour_draw_over_rows(self):
        self._tour('h34', 'timeline_002b3_a9_draw_over_rows')

    def test_a12_tour_escape_cancels(self):
        self._tour('h34', 'timeline_002b3_a12_escape_cancels')

    def test_a16_tour_edge_scroll_both_axes(self):
        self._tour('h34', 'timeline_002b3_a16_edge_scroll_both_axes', size='1600x420')

    def test_a17_tour_column_headers(self):
        self._tour('h34', 'timeline_002b3_a17_column_headers')

    def test_a18_tour_row_headers(self):
        self._tour('h34', 'timeline_002b3_a18_row_headers')

    def test_a5_tour_phone(self):
        self._tour('h34', 'timeline_002b3_a5_phone', size=PHONE)

    # -- the selection buttons (R8, R13) ---------------------------------------------------------

    def test_a9_tour_buttons_after_release(self):
        self._tour('h34', 'timeline_002b3_a9_buttons_after_release')

    def test_a23_tour_plan_button(self):
        self._tour('h34', 'timeline_002b3_a23_plan_button')

    def test_a37_tour_restricted(self):
        self._tour('h34', 'timeline_002b3_a37_restricted', login=RESTRICTED)

    # -- A63: the view's create and delete options (decision D3) ---------------------------------

    def _tl_option_action(
        self, options, base_view='test_web_gantt.host_view_h33', domain='[]',
        context="{'group_by': ['parent_id', 'x_contact']}",
    ):
        """An action like H34 on a copy of H33's view with ``options`` set on the root tag."""
        base = self.env.ref(base_view)
        arch = etree.fromstring(base.arch)
        for key, value in options.items():
            arch.set(key, value)
        view = self.env['ir.ui.view'].create({
            'name': 'H33 options ' + ' '.join(f'{k}={v}' for k, v in options.items()),
            'model': PILL,
            'type': 'gantt',
            'arch': etree.tostring(arch, encoding='unicode'),
        })
        action = self.env['ir.actions.act_window'].create({
            'name': 'H33 options',
            'res_model': PILL,
            'view_mode': 'gantt,list,form',
            'view_id': view.id,
            'search_view_id': self.env.ref('test_web_gantt.host_view_h13').id,
            'context': context,
            'domain': domain,
        })
        return f'/odoo/action-{action.id}'

    def test_a63_tour_create_and_delete_off(self):
        path = self._tl_option_action({'create': '0', 'delete': '0'})
        self._tour(path, 'timeline_002b3_a63_create_delete_off')

    def test_a63_tour_delete_off(self):
        path = self._tl_option_action({'delete': '0'})
        self._tour(path, 'timeline_002b3_a63_delete_off')

    def test_a63_tour_explicit_yes_for_the_restricted_user(self):
        path = self._tl_option_action({'create': '1', 'edit': '1', 'delete': '1'})
        self._tour(path, 'timeline_002b3_a63_explicit_yes', login=RESTRICTED)

    def test_a63_tour_no_unlink_right(self):
        group = self.env['res.groups'].create({'name': 'Pill creators without unlink'})
        self.env['ir.access'].create({
            'name': 'Pill creators without unlink',
            'model_id': self.env['ir.model']._get_id(PILL),
            'group_id': group.id,
            'operation': 'cru',
        })
        self.env['res.users'].create({
            'name': 'Creator without unlink',
            'login': 'creator_no_unlink',
            'password': 'creator_no_unlink',
            'group_ids': [Command.set([self.env.ref('base.group_user').id, group.id])],
        })
        path = self._tl_option_action({})
        self._tour(path, 'timeline_002b3_a63_no_unlink_right', login='creator_no_unlink')

    # -- creating from the template form (R10 to R12) --------------------------------------------

    def _tl_utc(self, days, hour, minute=0):
        """The record value of ``hour`` o'clock, ``days`` from today, in a UTC browser."""
        return datetime.combine(self.today + timedelta(days=days), clock(hour, minute))

    def _tl_created(self, name):
        return self.env[PILL].search([('name', '=', name)], order='id')

    def _tl_template_action(self, template, base_view='test_web_gantt.host_view_h33', **kwargs):
        """H34 (or another host) whose view names ``template`` as its template form."""
        return self._tl_option_action(
            {'multi_create_view': template}, base_view=base_view, **kwargs)

    def test_a29_create_one_record(self):
        """One create call, with the multi-creation key, holding one record for the clicked day."""
        model = type(self.env[PILL])
        original = model.create
        calls = []

        @functools.wraps(original)
        def spy(records, vals_list):
            calls.append((records.env.context.get('multi_create'), len(vals_list)))
            return original(records, vals_list)

        with patch.object(model, 'create', spy):
            self._tour('h34', 'timeline_002b3_a29_create_one_record')
        self.assertEqual(calls, [(True, 1)])
        sprint = self._tl_created('Sprint')
        self.assertEqual(len(sprint), 1)
        self.assertEqual(sprint.date_start, self._tl_utc(0, 12))
        self.assertEqual(sprint.date_stop, self._tl_utc(0, 13))
        self.assertEqual(sprint.parent_id, self.records['Beta'])
        self.assertFalse(sprint.x_contact)

    def test_a30_rows_win(self):
        self._tour('h34', 'timeline_002b3_a30_rows_win')
        rows = self._tl_created('Row test')
        self.assertEqual(rows.mapped('name'), ['Row test'] * 3)
        self.assertEqual(rows.parent_id, self.records['Beta'])
        self.assertEqual(
            sorted(rows.mapped(lambda r: r.x_contact.id or 0)),
            sorted([0, self.records['C2'].id, self.records['C3'].id]),
        )
        for record in rows:
            self.assertEqual(
                (record.date_start, record.date_stop), (self._tl_utc(0, 12), self._tl_utc(0, 13)))

    def test_a31_tags_row(self):
        """H4's view with H33's option added: the row's tag replaces the form's tags."""
        path = self._tl_template_action(
            'test_web_gantt.host_form_template_one',
            base_view='test_web_gantt.host_view_h4',
            domain="[('name', 'in', ['Design', 'Build', 'Review'])]",
            context="{'group_by': ['x_tags']}",
        )
        self._tour(path, 'timeline_002b3_a31_tags_row')
        tag1 = self.records['T1']
        empty = self._tl_created('Tag empty')
        self.assertEqual(len(empty), 1)
        self.assertEqual(empty.x_tags, tag1)
        two = self._tl_created('Tag two')
        self.assertEqual(len(two), 2)
        self.assertEqual(
            sorted(two.mapped(lambda r: tuple(sorted(r.x_tags.ids)))),
            sorted([(tag1.id,), ()]),
        )

    def test_a32_date_only(self):
        self._tour('h35', 'timeline_002b3_a32_date_only')
        day = self.env['test.web.gantt.pill2'].search([('name', '=', 'Day test')])
        self.assertEqual(len(day), 1)
        self.assertEqual(day.date_start, self.today + timedelta(days=2))
        self.assertEqual(day.date_stop, self.today + timedelta(days=2))

    def test_a33_validation(self):
        count = self.env[PILL].search_count([])
        self._tour('h34', 'timeline_002b3_a33_validation')
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_a34_kept_values(self):
        count = self.env[PILL].search_count([])
        # the tour reloads the page itself: the start time is kept by the browser, the values not
        self._tour('h34', 'timeline_002b3_a34_kept_values')
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_a35_new_with_selection(self):
        count = self.env[PILL].search_count([])
        self._tour('h34', 'timeline_002b3_a35_new_with_selection')
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_a62_halves(self):
        self._tour('h34', 'timeline_002b3_a62_halves_and_mixed')
        halves = self._tl_created('Halves').sorted('date_start')
        self.assertEqual(len(halves), 2)
        self.assertEqual(halves.mapped('date_start'), [self._tl_utc(0, 12), self._tl_utc(1, 12)])
        self.assertEqual(halves.mapped('date_stop'), [self._tl_utc(0, 13), self._tl_utc(1, 13)])
        self.assertEqual(halves.parent_id, self.records['Beta'])

    def test_a62_mixed_model(self):
        """H14 (start field date-only, stop field date and time) with H33's option added."""
        path = self._tl_template_action(
            'test_web_gantt.host_form_template_one',
            base_view='test_web_gantt.host_view_h14',
            domain="['|', ('name', '=like', 'MIX%'), ('name', '=like', 'Mixed%')]",
            context='{}',
        )
        self._tour(path, 'timeline_002b3_a62_mixed_model')
        one = self._tl_created('Mixed one')
        self.assertEqual((len(one), one.x_day, one.date_stop), (1, self.today, self._tl_utc(0, 12)))
        two = self._tl_created('Mixed two')
        self.assertEqual(
            (len(two), two.x_day, two.date_stop),
            (1, self.today + timedelta(days=1), self._tl_utc(2, 0)),
        )

    def test_a64_cell_wins(self):
        self._tour('h34', 'timeline_002b3_a64_cell_wins')
        record = self._tl_created('Cell wins')
        self.assertEqual(len(record), 1)
        self.assertFalse(record.x_contact)
        self.assertEqual(record.parent_id, self.records['Beta'])
        self.assertEqual(record.x_color, 5)

    def test_a64_cell_wins_over_dates(self):
        """A template form showing the dates: the cell's days replace the typed ones."""
        form = self.env['ir.ui.view'].create({
            'name': 'Template form with dates',
            'model': PILL,
            'type': 'form',
            'arch': '<form><group><field name="name" required="1"/><field name="x_contact"/>'
                    '<field name="x_color"/><field name="date_start"/><field name="date_stop"/>'
                    '</group></form>',
        })
        self.env['ir.model.data'].create({
            'module': 'test_web_gantt', 'name': 'tl_template_with_dates',
            'model': 'ir.ui.view', 'res_id': form.id,
        })
        path = self._tl_template_action('test_web_gantt.tl_template_with_dates')
        self._tour(path, 'timeline_002b3_a64_cell_wins_dates')
        record = self._tl_created('Cell wins')
        self.assertEqual(len(record), 1)
        self.assertEqual(
            (record.date_start, record.date_stop), (self._tl_utc(0, 12), self._tl_utc(0, 13)))
        self.assertFalse(record.x_contact)
        self.assertEqual(record.x_color, 5)

    def test_a63_server_refuses_create(self):
        """Create set explicitly to yes: Add shows and the server refuses (E1)."""
        count = self.env[PILL].search_count([])
        path = self._tl_option_action({'create': '1', 'edit': '1', 'delete': '1'})
        self._tour(path, 'timeline_002b3_a63_server_refuses_create', login=RESTRICTED)
        self.assertEqual(self.env[PILL].search_count([]), count)
        self.assertFalse(self._tl_created('Refused'))

    def test_a63_server_refuses_constraint(self):
        """The create call itself refused (a constraint): the Community error, nothing created."""
        model = type(self.env[PILL])
        original = model.create

        @functools.wraps(original)
        def refuse(records, vals_list):
            if records.env.context.get('multi_create'):
                raise ValidationError('Multi-creation refused by a constraint')
            return original(records, vals_list)

        count = self.env[PILL].search_count([])
        with patch.object(model, 'create', refuse):
            self._tour('h34', 'timeline_002b3_a63_server_refuses_constraint')
        self.assertEqual(self.env[PILL].search_count([]), count)

    # -- deleting a selection (R14) --------------------------------------------------------------

    def _tl_sprint(self):
        """The one "Sprint" record of A29, today 12:00 to 13:00 in Beta without contact."""
        return self.env[PILL].create({
            'name': 'Sprint',
            'parent_id': self.records['Beta'].id,
            'date_start': self._tl_utc(0, 12),
            'date_stop': self._tl_utc(0, 13),
        })

    def test_a38_a39_tour_delete(self):
        """Ok sends one deletion call of the counted record (A39)."""
        sprint = self._tl_sprint()
        model = type(self.env[PILL])
        original = model.unlink
        calls = []

        @functools.wraps(original)
        def spy(records):
            calls.append(records.ids)
            return original(records)

        with patch.object(model, 'unlink', spy):
            self._tour('h34', 'timeline_002b3_a38_a39_delete')
        self.assertEqual(calls, [sprint.ids])
        self.assertFalse(sprint.exists())

    def test_a40_tour_discard(self):
        sprint = self._tl_sprint()
        self._tour('h34', 'timeline_002b3_a40_discard')
        self.assertTrue(sprint.exists())

    def test_a41_tour_delete_cut_pills(self):
        """The cut pills of the row go too (the savepoint of the test gives the host back)."""
        self._tl_sprint()
        names = ['Long task', 'Overlap A', 'Overlap B', 'Overlap C']
        self.assertEqual(len(self.env[PILL].search([('name', 'in', names)])), 4)
        self._tour('h34', 'timeline_002b3_a41_delete_cut_pills')
        self.assertFalse(self.env[PILL].search([('name', 'in', names)]))

    def test_a63_server_refuses_delete(self):
        """The deletion call itself refused: the Community error, nothing deleted (E2)."""
        sprint = self._tl_sprint()
        model = type(self.env[PILL])
        original = model.unlink

        @functools.wraps(original)
        def refuse(records):
            if 'Sprint' in records.mapped('name'):
                raise UserError('Deletion refused by the server')
            return original(records)

        with patch.object(model, 'unlink', refuse):
            self._tour('h34', 'timeline_002b3_a63_server_refuses_delete')
        self.assertTrue(sprint.exists())

    # -- the side panel (R17, R18) -----------------------------------------------------------------

    def test_a43_tour_shown(self):
        self._tour('h36', 'timeline_002b3_a43_shown')
        self._tour('h37', 'timeline_002b3_a43_shown')

    def test_a43_tour_conditions(self):
        # no option; edit off; sample data with the option; the phone with the option
        self._tour('h18', 'timeline_002b3_a43_conditions')
        self._tour('h39', 'timeline_002b3_a43_conditions')
        self._tour('h38', 'timeline_002b3_a43_conditions')
        self._tour('h36', 'timeline_002b3_a43_conditions', size=PHONE)

    def test_a54_tour_open_close_remembered(self):
        self._tour('h36', 'timeline_002b3_a54_open_close_remembered')

    def test_a55_tour_resize(self):
        self._tour('h37', 'timeline_002b3_a55_resize')

    # -- the list of the records to schedule (R19) -------------------------------------------------

    def _tl_queue(self):
        """Queue 01 to Queue 22: records without dates (the test's savepoint takes them back)."""
        return self.env[PILL].create([{'name': f'Queue {i:02d}'} for i in range(1, 23)])

    def test_a44_tour_list(self):
        self._tour('h36', 'timeline_002b3_a44_list')
        self._tour('h37', 'timeline_002b3_a44_list')
        # a record changed elsewhere: Alpha gets a start and no stop, so it is not listed
        alpha = self.env[PILL].search([('name', '=', 'Alpha')])
        alpha.write({'date_start': fields.Datetime.now()})
        self._tour('h36', 'timeline_002b3_a44_list_start_only')
        alpha.write({'date_start': False})
        self._tour('h36', 'timeline_002b3_a44_list')

    def test_a45_tour_date_filter_ignored(self):
        action = self.env.ref('test_web_gantt.host_action_h36')
        self.env['ir.filters'].create({
            'name': 'Start is set',
            'model_id': PILL,
            'domain': "[('date_start', '!=', False)]",
            'action_id': action.id,
            'user_ids': [Command.set([self.env.ref('base.user_admin').id])],
            'is_default': True,
        })
        self._tour('h36', 'timeline_002b3_a45_date_filter_ignored')

    def test_a46_tour_open_line(self):
        self._tour('h36', 'timeline_002b3_a46_open_line')

    def test_a53_tour_load_more(self):
        queue = self._tl_queue()
        self._tour('h36', 'timeline_002b3_a53_load_more')
        queue.unlink()
        self.assertFalse(self.env[PILL].search([('name', 'like', 'Queue ')]))

    def test_a25_tour_load_more_clears(self):
        queue = self._tl_queue()
        self._tour('h40', 'timeline_002b3_a25_load_more_clears')
        queue.unlink()

    def test_a58_tour_hover(self):
        self._tour('h37', 'timeline_002b3_a58_hover')

    # -- scheduling a record by dragging its line (R21) ------------------------------------------

    def _tl_pill(self, name):
        return self.env[PILL].search([('name', '=', name)], limit=1)

    def _tl_utc_on(self, day, hour=0):
        return datetime.combine(day, clock(hour))

    def test_a47_tour_schedule(self):
        record = self._tl_pill('Unscheduled')
        beta = self._tl_pill('Beta')
        self._tour('h37', 'timeline_002b3_a47_schedule')
        # one write: today from 12:00 to the next day's 12:00 (UTC, offset 0) and Parent Beta
        self.assertEqual(record.date_start, self._tl_utc_on(self.today, 12))
        self.assertEqual(record.date_stop, self._tl_utc_on(self.today + timedelta(days=1), 12))
        self.assertEqual(record.parent_id, beta)

    def test_a48_tour_ungrouped_and_group_row(self):
        gamma = self._tl_pill('Gamma')
        self.assertFalse(gamma.parent_id)
        self._tour('h36', 'timeline_002b3_a48_ungrouped_and_group_row')
        # the first half of the day before today: a day from 00:00, no grouping value
        self.assertEqual(gamma.date_start, self._tl_utc_on(self.today + timedelta(days=-1)))
        self.assertEqual(gamma.date_stop, self._tl_utc_on(self.today))
        self.assertFalse(gamma.parent_id)
        gamma.write({'date_start': False, 'date_stop': False})
        self._tour('h41', 'timeline_002b3_a48_ungrouped_and_group_row')
        self.assertEqual(gamma.date_start, self._tl_utc_on(self.today, 12))
        self.assertEqual(gamma.parent_id, self._tl_pill('Beta'))

    def test_a49_tour_readonly_rows(self):
        record = self._tl_pill('Unscheduled')
        self._tour('h41', 'timeline_002b3_a49_readonly_rows')
        self.assertEqual(record.date_start, self._tl_utc_on(self.today, 12))
        self.assertEqual(record.parent_id, self._tl_pill('Beta'))

    def test_a50_tour_cancel(self):
        record = self._tl_pill('Unscheduled')
        self._tour('h37', 'timeline_002b3_a50_cancel')
        self.assertFalse(record.date_start)
        self.assertFalse(record.date_stop)

    def test_a51_tour_drop_zone(self):
        record = self._tl_pill('Unscheduled')
        record.write({
            'date_start': self._tl_utc_on(self.today, 12),
            'date_stop': self._tl_utc_on(self.today + timedelta(days=1), 12),
            'parent_id': self._tl_pill('Beta').id,
        })
        self._tour('h37', 'timeline_002b3_a51_drop_zone')
        self.assertFalse(record.date_start)
        self.assertFalse(record.date_stop)

    def test_a52_tour_copy_on_zone(self):
        review = self._tl_pill('Review')
        count = self.env[PILL].search_count([])
        self.assertTrue(review.date_start)
        self._tour('h36', 'timeline_002b3_a52_copy_on_zone')
        self.assertFalse(review.date_start)
        self.assertFalse(review.date_stop)
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_a56_tour_edge_scroll_with_panel(self):
        self._tour('h36', 'timeline_002b3_a56_edge_scroll_with_panel')

    def test_a57_tour_clears_selection(self):
        record = self._tl_pill('Unscheduled')
        self._tour('h40', 'timeline_002b3_a57_clears_selection')
        self.assertFalse(record.date_start)

    def test_a60_tour_date_only(self):
        """H25's view with the scheduling option, and one record of its model without dates."""
        base = self.env.ref('test_web_gantt.host_view_h25')
        arch = etree.fromstring(base.arch)
        arch.set('schedule', '1')
        view = self.env['ir.ui.view'].create({
            'name': 'H25 schedule',
            'model': 'test.web.gantt.pill2',
            'type': 'gantt',
            'arch': etree.tostring(arch, encoding='unicode'),
        })
        action = self.env['ir.actions.act_window'].create({
            'name': 'H25 schedule',
            'res_model': 'test.web.gantt.pill2',
            'view_mode': 'gantt,list,form',
            'view_id': view.id,
        })
        record = self.env['test.web.gantt.pill2'].create({'name': 'Undated'})
        self._tour(f'/odoo/action-{action.id}', 'timeline_002b3_a60_date_only')
        # by 002b D1 the day is both the start and the stop (the original wrote the next day)
        self.assertEqual(record.date_start, self.today)
        self.assertEqual(record.date_stop, self.today)

    def test_a61_tour_writes_in_order(self):
        model = type(self.env[PILL])
        original = model.write
        events = []

        def slow(records, vals):
            if 'date_start' in vals and records.name in ('Unscheduled', 'Gamma'):
                events.append(('start', records.name, time.monotonic()))
                if not any(kind == 'end' for kind, _name, _stamp in events):
                    time.sleep(2)
                result = original(records, vals)
                events.append(('end', records.name, time.monotonic()))
                return result
            return original(records, vals)

        with patch.object(model, 'write', slow):
            self._tour('h37', 'timeline_002b3_a61_writes_in_order')
        self.assertEqual(
            [(kind, name) for kind, name, _stamp in events],
            [('start', 'Unscheduled'), ('end', 'Unscheduled'),
             ('start', 'Gamma'), ('end', 'Gamma')])
        self.assertGreaterEqual(events[2][2], events[1][2])
        self.assertTrue(self._tl_pill('Unscheduled').date_start)
        self.assertTrue(self._tl_pill('Gamma').date_start)
