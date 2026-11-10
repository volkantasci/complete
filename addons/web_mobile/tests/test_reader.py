# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests import tagged

from .mobile_host import CwmHostCase

ENV = "odoo.__WOWL_DEBUG__.root.env"
TOLERANCE = 60
EMPTY = {'success': True, 'data': ''}


@tagged('post_install', '-at_install')
class TestReader(CwmHostCase):

    def join(self, name):
        self.js(f"""(() => {{
            const bus = {ENV}.services.mobile.bus;
            window.__cwmListeners = window.__cwmListeners || {{}};
            window.__cwmScans = window.__cwmScans || [];
            window.__cwmListeners[{name!r}] = (ev) => window.__cwmScans.push(ev.detail.data);
            bus.addEventListener({name!r}, window.__cwmListeners[{name!r}]);
            return true;
        }})()""")

    def leave(self, name):
        self.js(f"""(() => {{
            {ENV}.services.mobile.bus.removeEventListener(
                {name!r}, window.__cwmListeners[{name!r}]);
            return true;
        }})()""")

    def reads(self):
        return self.host_requests('getReaderData')

    def wait_reads(self, count, timeout=15):
        self.wait(
            "window.__cwmHostLog.filter((e) => e.action === 'getReaderData')"
            f".length >= {count}", timeout=timeout)

    def gaps(self, count):
        times = [e['at'] for e in self.reads()]
        return [b - a for a, b in zip(times, times[1:count], strict=False)]

    def assertNear(self, value, expected):
        self.assertLessEqual(abs(value - expected), TOLERANCE, f'{value} not near {expected}')

    def test_A40_reader_loop(self):
        answers = {'getReaderData': [EMPTY, {'success': True, 'data': 'ABC'}, EMPTY]}
        with self.host_session(host={'answers': answers}):
            self.join('mobile_reader_scanned')
            self.wait_reads(6)
            self.assertEqual(len(self.host_requests('enableReader')), 1)
            self.assertEqual(self.js('window.__cwmScans'), ['ABC'])
            for gap in self.gaps(6):
                # delay of the stub's answer (5 ms) plus one interval
                self.assertNear(gap, 105)
            self.join('other')
            self.js("new Promise((r) => setTimeout(r, 300))")
            self.assertEqual(len(self.host_requests('enableReader')), 1)
            self.leave('mobile_reader_scanned')
            self.leave('other')
            self.js("new Promise((r) => setTimeout(r, 400))")
            stopped = len(self.reads())
            self.js("new Promise((r) => setTimeout(r, 600))")
            self.assertEqual(len(self.reads()), stopped)
            self.assertEqual(len(self.host_requests('enableReader')), 1)
            self.assertEqual(self.js('window.__cwmScans'), ['ABC'])

    def test_A41_session_interval(self):
        IrHttp = type(self.env['ir.http'])
        original = IrHttp.session_info

        def session_info(this):
            return dict(original(this), time_between_reads_in_ms=300)

        self.patch(IrHttp, 'session_info', session_info)
        with self.host_session(host={}):
            self.join('x')
            self.wait_reads(3)
            for gap in self.gaps(3):
                self.assertNear(gap, 305)

    def test_A64_reader_errors(self):
        fail = {'success': False, 'data': 'nope'}
        with self.host_session(host={'answers': {'getReaderData': [fail, fail, EMPTY]}}):
            self.join('x')
            self.wait_reads(4)
            warnings = [c for c in self.console_entries() if 'reader' in c['text']]
            self.assertEqual(len(warnings), 2)
            self.leave('x')
            self.js("new Promise((r) => setTimeout(r, 300))")
            self.assertEqual(len(self.host_requests('enableReader')), 1)
            seen = len(self.reads())
            self.join('x')
            self.wait_reads(seen + 2)
            self.assertEqual(len(self.host_requests('enableReader')), 2)

    def test_A67_reader_timeout(self):
        answers = {'getReaderData': ['never', EMPTY]}
        with self.host_session(host={'answers': answers}):
            self.join('mobile_reader_scanned')
            self.wait_reads(1)
            first = self.reads()[0]
            self.js("new Promise((r) => setTimeout(r, 700))")
            self.assertEqual(len(self.reads()), 1)
            self.wait_reads(2)
            second = self.reads()[1]
            # one limit (1000 ms) plus one interval after the first request
            self.assertNear(second['at'] - first['at'], 1100)
            self.answer_request(first['id'], {'success': True, 'data': 'LATE'})
            self.js("new Promise((r) => setTimeout(r, 400))")
            self.assertEqual(self.js('window.__cwmScans'), [])
