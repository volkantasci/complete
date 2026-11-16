# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of slice 002c (dependencies, rescheduling and buffers).

The package's fixed date: the browser's clock is Thursday 12 November 2026 at noon (UTC) and the
records are built around that day with a zero offset. A scenario that changes the database runs
inside the test's own savepoint, which is rolled back after it.

A tour that needs real pointer events asks for them through ``window.__tl_mouse`` (see
``timeline_real_pointer``).
"""
import json
import os
import time
from datetime import datetime, timedelta

from lxml import etree
from odoo import Command
from odoo.tests import HttpCase, tagged

from .timeline_real_pointer import RealPointerMixin

HOST_ACTION = '/odoo/action-test_web_gantt.host_action_{}'
PILL = 'test.web.gantt.pill'
DESKTOP = '1600x900'
D0 = datetime(2026, 11, 12, 12)
RESTRICTED = 'restricted_editor'
LONG_NAME = 'A very long name of a record that cannot fit into the narrow panel of the view'


@tagged('post_install', '-at_install')
class TestTimelineDependencyTours(RealPointerMixin, HttpCase):

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
        cls.records = pill._tl_build_host_records(today='2026-11-12', tz_offset_hours=0)
        cls.rtl_user = pill._tl_rtl_user()
        cls.restricted = cls.env['res.users'].search([('login', '=', RESTRICTED)]) or \
            cls.env['res.users'].create({
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

    def _tour(self, host, name, login='admin', size=DESKTOP, touch=False, now=D0):
        self.browser_size = size
        self.touch_enabled = touch
        path = host if host.startswith('/') else HOST_ACTION.format(host)
        self.start_tour_with_pointer(path, name, login=login, now=now)

    # -- the name in a line of the side panel (R1) -----------------------------------------------

    def test_a2_tour_line_drag_and_open(self):
        record = self.env[PILL].search([('name', '=', 'Unscheduled')], limit=1)
        beta = self.env[PILL].search([('name', '=', 'Beta')], limit=1)
        long = self.env[PILL].create({'name': LONG_NAME})
        self.assertFalse(record.date_start)
        self._tour('h37', 'timeline_002c_a2_line_drag_and_open')
        # the press on the empty part scheduled the record as a press on its name does
        self.assertEqual(record.date_start, datetime(2026, 11, 12, 12))
        self.assertEqual(record.date_stop, datetime(2026, 11, 13, 12))
        self.assertEqual(record.parent_id, beta)
        # restore the record and delete the long-named one
        record.write({'date_start': False, 'date_stop': False})
        long.unlink()
        self.assertFalse(record.date_start)
        self.assertFalse(long.exists())

    # -- the action's own filter in the side panel's list (R2) -----------------------------------

    def test_a4_tour_and_date_filter(self):
        self._tour('h51', 'timeline_002c_a4_and_date_filter')

    def test_a5_tour_or_date_filter(self):
        self._tour('h52', 'timeline_002c_a5_or_date_filter')

    def test_a6_tour_negated_date_filter(self):
        self._tour('h53', 'timeline_002c_a6_negated_date_filter')

    # -- folded columns in multi-selection mode (R3) ---------------------------------------------

    def _tl_folded_action(self):
        """H12 (unavailability) with 002b3 H33's multi-creation option, every contact unavailable
        on D+3 and D+4 and no pill on these days, so that the two days fold into one column."""
        pill = self.env[PILL]
        start, stop = (D0 + timedelta(days=3), D0 + timedelta(days=5))
        text = {
            'start': start.strftime('%Y-%m-%d 00:00:00'),
            'stop': stop.strftime('%Y-%m-%d 00:00:00'),
        }
        pill.search([('date_start', '<', text['stop']), ('date_stop', '>', text['start'])]).unlink()
        contacts = [self.records[f'C{i}'] for i in (1, 2, 3)]
        self.env['ir.config_parameter'].set_str('test_web_gantt.hook_answers', json.dumps({
            'unavailability': {'x_contact': {str(c.id): [text] for c in contacts}},
        }))
        arch = etree.fromstring(self.env.ref('test_web_gantt.host_view_h12').arch)
        arch.set('multi_create_view', 'test_web_gantt.host_form_template_one')
        view = self.env['ir.ui.view'].create({
            'name': 'H12 folded multi', 'model': PILL, 'type': 'gantt',
            'arch': etree.tostring(arch, encoding='unicode'),
        })
        action = self.env['ir.actions.act_window'].create({
            'name': 'H12 folded multi',
            'res_model': PILL,
            'view_mode': 'gantt,list,form',
            'view_id': view.id,
            'context': "{'group_by': ['x_contact']}",
        })
        return f'/odoo/action-{action.id}'

    def test_a8_tour_folded_headers(self):
        self._tour(self._tl_folded_action(), 'timeline_002c_a8_folded_headers')

    def test_a9_tour_folded_cells(self):
        self._tour(self._tl_folded_action(), 'timeline_002c_a9_folded_cells')

    # -- arrows (R4 to R10) ----------------------------------------------------------------------

    def test_a11_tour_arrows(self):
        self._tour('h42', 'timeline_002c_a11_arrows')

    def test_a11_tour_no_dependency_field(self):
        self._tour('h1', 'timeline_002c_a11_no_dependency_field')

    def test_a11_tour_phone(self):
        self._tour('h42', 'timeline_002c_a11_phone', size='390x844', touch=True)

    def test_a13_tour_next_range(self):
        self._tour('h42', 'timeline_002c_a13_next_range')

    def test_a14_tour_records_in_several_rows(self):
        self._tour('h43', 'timeline_002c_a14_records_in_several_rows')

    def test_a15_tour_arrow_out_of_view(self):
        self._tour('h42', 'timeline_002c_a15_arrow_out_of_view')

    def test_a17_tour_rtl_arrows(self):
        self._tour('h42', 'timeline_002c_a17_rtl_arrows', login='rtl')

    def test_a20_tour_arrows_under_pills(self):
        self._tour('h42', 'timeline_002c_a20_arrows_under_pills')

    def test_a21_tour_pointer_over_a_pill(self):
        self._tour('h42', 'timeline_002c_a21_pointer_over_a_pill')

    def test_a22_tour_pointer_over_an_arrow(self):
        self._tour('h42', 'timeline_002c_a22_pointer_over_an_arrow')

    def test_a24_tour_remove_dependency(self):
        build, test = self.records['Build'], self.records['Test']
        self.assertIn(build, test.dependency_field)
        self._tour('h42', 'timeline_002c_a24_remove_dependency')
        # one write took Build out of Test's blockers; restore the link
        self.assertNotIn(build, test.dependency_field)
        test.write({'dependency_field': [Command.link(build.id)]})
        self.assertIn(build, test.dependency_field)

    def test_a25_tour_read_only(self):
        self._tour('h42', 'timeline_002c_a25_read_only', login=RESTRICTED)

    def test_a25_tour_refused_removal(self):
        build, test = self.records['Build'], self.records['Test']
        self._tour('h54', 'timeline_002c_a25_refused_removal', login=RESTRICTED)
        self.assertIn(build, test.dependency_field)

    def test_a75_a76_tour_lit_arrow_over_a_pill(self):
        self._tour('h42', 'timeline_002c_a75_a76_lit_arrow_over_a_pill')

    # -- drawing a dependency (R11, R12, R24) ----------------------------------------------------

    def _links(self):
        return {record.id: record.dependency_field.ids for record in self.env[PILL].search([])}

    def _restore_links(self, links):
        """Write the dependency links back as they were (the tour changed them for real)."""
        for record in self.env[PILL].search([]):
            record.invalidate_recordset(['dependency_field'])
            if record.dependency_field.ids != links[record.id]:
                record.write({'dependency_field': [Command.set(links[record.id])]})
        self.assertEqual(self._links(), links)

    def _draw_tour(self, host, name, expected=None, **kwargs):
        """Run the tour; `expected` is `(target, source)` of the one link it must add."""
        links = self._links()
        try:
            self._tour(host, name, **kwargs)
            for record in self.env[PILL].search([]):
                record.invalidate_recordset(['dependency_field'])
            now = self._links()
            if expected is None:
                self.assertEqual(now, links)
            else:
                target, source = (self.records[expected[0]], self.records[expected[1]])
                self.assertEqual(sorted(now[target.id]), sorted(links[target.id] + [source.id]))
                self.assertEqual({k: sorted(v) for k, v in now.items() if k != target.id},
                                 {k: sorted(v) for k, v in links.items() if k != target.id})
        finally:
            self._restore_links(links)

    def test_a26_tour_handles(self):
        self._tour('h42', 'timeline_002c_a26_handles')

    def test_a27_tour_draw_from_the_end(self):
        self._draw_tour('h42', 'timeline_002c_a27_draw_from_the_end', ('Overlap C', 'Build'))

    def test_a28_tour_draw_from_the_start(self):
        self._draw_tour('h42', 'timeline_002c_a28_draw_from_the_start', ('Plan', 'Review'))

    def test_a29_tour_no_write(self):
        self._draw_tour('h42', 'timeline_002c_a29_no_write')

    def test_a30_tour_clears_selection(self):
        self._draw_tour('h48', 'timeline_002c_a30_clears_selection')

    def test_a31_tour_edge_scroll(self):
        links = self._links()
        try:
            self._tour('h42', 'timeline_002c_a31_edge_scroll')
        finally:
            self._restore_links(links)

    def test_a32_tour_cycle(self):
        self._draw_tour('h42', 'timeline_002c_a32_cycle', ('Design', 'Test'))

    def test_a87_tour_locked_pill(self):
        self._draw_tour('h42', 'timeline_002c_a87_locked_pill', ('Plan', 'Test'))

    # -- the method button, its menu and the switch (R13, R14) -----------------------------------

    def test_a33_tour_show_dependencies(self):
        self._tour('h42', 'timeline_002c_a33')

    def test_a35_tour_method_menu(self):
        self._tour('h42', 'timeline_002c_a35')

    def test_a37_tour_phone(self):
        self._tour('h42', 'timeline_002c_a37_phone', size='390x844', touch=True)

    def test_a37_tour_sample(self):
        self._tour('h50', 'timeline_002c_a37_sample')

    def test_a70_tour_read_only(self):
        self._tour('h49', 'timeline_002c_a70')

    def test_a74_tour_storage_keys(self):
        self._tour('h42', 'timeline_002c_a74')

    # -- the buffer bands (R22) ------------------------------------------------------------------

    def _buffer_tour(self, name, **kwargs):
        review = self.records['Review']
        values = (review.x_buffer_before, review.x_buffer_after)
        try:
            self._tour('h44', name, **kwargs)
        finally:
            review.invalidate_recordset()
            review.write({'x_buffer_before': values[0], 'x_buffer_after': values[1]})

    def test_a64_tour_buffer_bands(self):
        self._buffer_tour('timeline_002c_a64')

    def test_a65_tour_band_hidden_while_moving(self):
        self._buffer_tour('timeline_002c_a65')

    def test_a65_tour_phone(self):
        self._buffer_tour('timeline_002c_a65_phone', size='390x844', touch=True)

    def test_a68_tour_band_in_view(self):
        self._buffer_tour('timeline_002c_a68')

    def test_a78_tour_zero_and_negative(self):
        self._buffer_tour('timeline_002c_a78')
