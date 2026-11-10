# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests import tagged

from .mobile_host import CwmHostCase


@tagged('post_install', '-at_install')
class TestBridge(CwmHostCase):

    def test_A1_host_hidden(self):
        with self.host_session(host={}):
            self.assertEqual(self.js('typeof window.OdooDeviceUtility'), 'undefined')
            self.assertTrue(self.js('odoo.__WOWL_DEBUG__.root.env.services.mobile.active'))
            self.call_capability('switchAccount')
            self.wait('window.__cwmHostLog.some((e) => e.action === "switchAccount")')
            self.assertEqual(len(self.host_requests('switchAccount')), 1)

    def test_A2_no_host_no_request(self):
        with self.host_session(host=None, ua=self.UA_DESKTOP):
            self.assertEqual(self.js('typeof odoo.native_notify'), 'function')
            self.assertEqual(self.js('typeof window.__cwmHostLog'), 'undefined')
            self.assertFalse(self.js('odoo.__WOWL_DEBUG__.root.env.services.mobile.active'))
            self.assertEqual(
                self.js('typeof odoo.__WOWL_DEBUG__.root.env.services.mobile.switchAccount'),
                'undefined')

    def test_A3_request_format(self):
        with self.host_session(host={'plugins': [{'name': 'switchAccount', 'action': 'sw'}]}):
            self.call_capability('switchAccount')
            self.call_capability('switchAccount')
            self.wait('window.__cwmHostLog.length >= 2')
            log = self.host_log()
            self.assertEqual([e['action'] for e in log[:2]], ['sw', 'sw'])
            self.assertEqual([e['args'] for e in log[:2]], [{}, {}])
            ids = [e['id'] for e in log[:2]]
            self.assertTrue(all(isinstance(i, str) for i in ids))
            self.assertEqual(len(set(ids)), 2)

    def test_A4_answers(self):
        with self.host_session(host={'answers': {'switchAccount': 'never'}}):
            ok = self.call_capability('switchAccount', key='ok')
            bad = self.call_capability('switchAccount', key='bad')
            # the page's own load-time requests (account, application list) come first
            self.wait("window.__cwmHostLog.filter((e) => e.action === 'switchAccount').length >= 2")
            first, second = [e['id'] for e in self.host_requests('switchAccount')[:2]]
            self.assertEqual(self.call_outcome(ok)['state'], 'pending')
            self.answer_request(first, {'success': True, 'data': 'yes'})
            self.answer_request(second, {'success': False, 'data': 'no'})
            self.wait(f'window.__cwmCalls.{bad}.state !== "pending"')
            self.assertEqual(self.call_outcome(ok), {
                'state': 'resolved', 'value': {'success': True, 'data': 'yes'}})
            self.assertEqual(self.call_outcome(bad), {
                'state': 'rejected', 'value': {'success': False, 'data': 'no'}})
            # unknown and repeated ids change nothing and raise nothing
            self.answer_request('cwm-never-used', {'success': True})
            self.answer_request(first, {'success': False})
            self.assertEqual(self.call_outcome(ok)['state'], 'resolved')

    def test_A6_duplicate(self):
        plugins = [
            {'name': 'switchAccount', 'action': 'first'},
            {'name': 'switchAccount', 'action': 'second'},
        ]
        with self.host_session(host={'plugins': plugins}):
            self.call_capability('switchAccount')
            self.wait('window.__cwmHostLog.length >= 1')
            self.assertEqual([e['action'] for e in self.host_log()], ['second'])

    def test_A7_extra_capability(self):
        plugins = [{'name': 'madeUpThing', 'action': 'made_up_action'}]
        with self.host_session(host={'plugins': plugins}):
            self.call_capability('madeUpThing', {'k': [1, 'x']})
            self.wait('window.__cwmHostLog.length >= 1')
            entry = self.host_log()[0]
            self.assertEqual(entry['action'], 'made_up_action')
            self.assertEqual(entry['args'], {'k': [1, 'x']})
