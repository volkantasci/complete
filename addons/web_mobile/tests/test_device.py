# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import json
import time

from odoo.tests import tagged

from .mobile_host import CwmHostCase

ALL_CAPABILITIES = [
    'addHomeShortcut', 'switchAccount', 'updateAvailableApps', 'updateAccount', 'downloadFile',
    'hashChange', 'overrideBackButton', 'crashManager', 'getShareTargetFiles', 'enableReader',
    'getReaderData',
]
WARNING = "This file is generated in the page and can't be saved from inside the mobile app."
MODULE = "odoo.loader.modules.get"
ENV = "odoo.__WOWL_DEBUG__.root.env"
PROBE = """(() => {
    const { Component, xml } = owl;
    class CwmProbe extends Component {
        static template = xml`<div class="o_cwm_probe">probe</div>`;
    }
    return CwmProbe;
})()"""


def without(*names):
    return {'plugins': [
        {'name': name, 'action': name} for name in ALL_CAPABILITIES if name not in names
    ]}


class CwmDeviceCase(CwmHostCase):

    needs = ()

    def setUp(self):
        super().setUp()
        for name in self.needs:
            if not self._is_installed(name):
                self.skipTest(f'{name} is not installed')

    def _is_installed(self, name):
        return bool(self.env['ir.module.module'].search(
            [('name', '=', name), ('state', '=', 'installed')], limit=1))

    def downloads_observed(self):
        """Record the browser's own downloads (denied); returns the growing list."""
        events = []
        self.browser._handlers['Browser.downloadWillBegin'] = (
            lambda **params: events.append(params))
        self.browser._websocket_request('Browser.setDownloadBehavior', params={
            'behavior': 'deny', 'eventsEnabled': True,
        })
        return events

    def watch_anchor_downloads(self):
        """Record the Community's save step: a click on its download link (it is not followed)."""
        self.js("""(() => {
            window.__cwmAnchors = [];
            document.addEventListener('click', (ev) => {
                const link = ev.target.closest && ev.target.closest('a.download-js-link');
                if (link) {
                    window.__cwmAnchors.push(link.getAttribute('download'));
                    ev.preventDefault();
                }
            }, true);
            return true;
        })()""")

    def anchor_downloads(self):
        return self.js('window.__cwmAnchors')

    def requests(self, action):
        return [entry['args'] for entry in self.host_requests(action)]

    def flips(self):
        return [args['enabled'] for args in self.requests('overrideBackButton')]

    def wait_flips(self, expected, timeout=15):
        wanted = json.dumps(','.join(str(v).lower() for v in expected))
        self.wait(
            "(window.__cwmHostLog || []).filter((e) => e.action === 'overrideBackButton')"
            f".map((e) => String(e.args.enabled)).join() === {wanted}", timeout=timeout)

    def settle(self, seconds=1.0):
        time.sleep(seconds)

    def page_download(self, name, *args):
        """Call the Community download helper ``name`` from the page with JSON ``args``."""
        self.js(f"""(() => {{
            const helpers = {MODULE}("@web/core/network/download");
            helpers[{json.dumps(name)}](...{json.dumps(list(args))});
            return true;
        }})()""")

    def start_report_download(self):
        """Print the invoice report when a PDF engine exists; else use the same helper."""
        company = self.env.ref('base.user_admin').company_id
        company_moves = self.env['account.move'].search([('company_id', '=', company.id)])
        invoice = company_moves.filtered(lambda move: move.move_type == 'out_invoice')[:1]
        self.assertTrue(invoice, 'no customer invoice')
        return self.js(f"""(async () => {{
            const env = {ENV};
            const {{ rpc }} = {MODULE}("@web/core/network/rpc");
            const state = await rpc("/report/get_pdf_engine_state", {{}});
            if (["ok", "upgrade"].includes(state)) {{
                env.services.action.doAction("account.account_invoices", {{
                    additionalContext: {{
                        active_ids: [{invoice.id}], active_id: {invoice.id},
                        active_model: "account.move",
                    }},
                }});
                return "print";
            }}
            // no PDF engine in this container: the text variant goes through the same helper
            const {{ downloadReport }} = {MODULE}("@web/webclient/actions/reports/utils");
            downloadReport(rpc, {{
                report_name: "account.report_invoice", report_type: "qweb-text",
                context: {{ active_ids: [{invoice.id}] }},
            }}, "text", {{}});
            return "helper";
        }})()""")

    def add_probe(self, service, anchor='.o_action_manager', key='probe'):
        """Open a popover or bottom sheet holding a test-only component; keep its closer."""
        self.js(f"""(() => {{
            const Probe = {PROBE};
            window.__cwmClosers = window.__cwmClosers || {{}};
            window.__cwmClosers[{json.dumps(key)}] = {ENV}.services.{service}.add(
                document.querySelector({json.dumps(anchor)}), Probe, {{}});
            return true;
        }})()""")

    def frames(self):
        """Resolve after the page rendered twice and ran its pending tasks (no timer)."""
        self.js("""new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(
            () => setTimeout(() => done(true), 0))))""")

    def press_back(self):
        self.js("document.dispatchEvent(new Event('backbutton')); true")


@tagged('post_install', '-at_install')
class TestDownloads(CwmDeviceCase):
    needs = ('account',)

    def setUp(self):
        super().setUp()
        # Without demo data there is no customer invoice: make a draft one (the browser
        # session holds a read-only cursor, so the data is made before it starts).
        company = self.env.ref('base.user_admin').company_id
        if not self.env['account.move'].search_count([
            ('company_id', '=', company.id), ('move_type', '=', 'out_invoice'),
        ]):
            self.env['account.move'].create({
                'move_type': 'out_invoice',
                'company_id': company.id,
                'partner_id': self.env['res.partner'].create({'name': 'Cwm Invoice Customer'}).id,
                'invoice_line_ids': [(0, 0, {'name': 'Cwm line', 'quantity': 1, 'price_unit': 10})],
            })

    def test_A26_report_download(self):
        with self.host_session(host={}):
            events = self.downloads_observed()
            self.watch_anchor_downloads()
            self.start_report_download()
            self.wait("(window.__cwmHostLog || []).some((e) => e.action === 'downloadFile')")
            self.settle()
            request = self.cwm_expect_one(self.requests('downloadFile'))
            self.assertTrue(request['url'].startswith('/'))
            self.assertNotIn('://', request['url'])
            self.assertIn('data', request['data'])
            self.assertTrue(request.get('csrf_token'))
            self.assertEqual(events, [])
            self.assertEqual(self.anchor_downloads(), [])

    def test_A28_addresses(self):
        with self.host_session(host={}):
            for url in (
                'http://example.test:8080/report/x?id=4&lang=fr#top',
                'https://example.org/files/one',
                '/report/y?id=5',
            ):
                self.page_download('download', {'url': url, 'data': {'k': 'v'}})
            self.wait(
                "(window.__cwmHostLog || []).filter((e) => e.action === 'downloadFile')"
                ".length === 3")
            self.assertEqual(
                [r['url'] for r in self.requests('downloadFile')],
                ['/report/x?id=4&lang=fr', '/files/one', '/report/y?id=5'])

    def test_A29_built_content(self):
        with self.host_session(host={}):
            events = self.downloads_observed()
            self.watch_anchor_downloads()
            self.page_download('downloadFile', 'hello', 'cwm.txt', 'text/plain')
            self.wait("!!document.querySelector('.o_notification')")
            self.settle()
            self.assertEqual(self.requests('downloadFile'), [])
            self.assertEqual(events, [])
            self.assertEqual(self.anchor_downloads(), [])
            self.assertEqual(
                self.js("document.querySelector('.o_notification').textContent.trim()"), WARNING)

    def test_A30_no_capability(self):
        with self.host_session(host=without('downloadFile')):
            self.downloads_observed()
            self.watch_anchor_downloads()
            if self.start_report_download() == 'helper':
                # no PDF engine here: the browser download is made through a file address
                partner = self.env.ref('base.partner_admin')
                attachment = self.env['ir.attachment'].create({
                    'name': 'cwm_probe.txt', 'raw': b'probe', 'res_model': 'res.partner',
                    'res_id': partner.id, 'mimetype': 'text/plain',
                })
                self.page_download('downloadFile', f'/web/content/{attachment.id}?download=true')
            self.wait("window.__cwmAnchors.length > 0", timeout=30)
            self.assertEqual(len(self.anchor_downloads()), 1)
            self.assertEqual(self.requests('downloadFile'), [])


@tagged('post_install', '-at_install')
class TestAttachmentDownload(CwmDeviceCase):
    needs = ('crm',)

    def test_A27_attachment_download(self):
        lead = self.env['crm.lead'].search([], limit=1)
        attachment = self.env['ir.attachment'].create({
            'name': 'cwm_probe.txt', 'raw': b'probe', 'res_model': 'crm.lead',
            'res_id': lead.id, 'mimetype': 'text/plain',
        })
        address = f'/web/content/{attachment.id}?download=true'
        with self.host_session(host={}):
            events = self.downloads_observed()
            self.watch_anchor_downloads()
            self.page_download('downloadFile', f'http://localhost:8069{address}')
            self.wait("(window.__cwmHostLog || []).some((e) => e.action === 'downloadFile')")
            self.settle()
            self.assertEqual(
                self.requests('downloadFile'),
                [{'form': {'method': 'GET'}, 'url': address}])
            self.assertEqual(events, [])
            self.assertEqual(self.anchor_downloads(), [])


@tagged('post_install', '-at_install')
class TestNavigation(CwmDeviceCase):
    needs = ('crm',)

    def open_first_card(self):
        self.wait("!!document.querySelector('.o_kanban_record')")
        self.js("document.querySelector('.o_kanban_record').click(); true")
        self.wait("!!document.querySelector('.o_form_view')")

    def test_A31_navigation(self):
        with self.host_session('/odoo/crm', host={}, mobile=True):
            self.open_first_card()
            self.settle()
            self.assertEqual(self.requests('hashChange'), [])
            self.js("history.back(); true")
            self.wait("(window.__cwmHostLog || []).some((e) => e.action === 'hashChange')")
            self.wait("!!document.querySelector('.o_kanban_view')")
            self.assertEqual(self.requests('hashChange'), [{}])
            self.open_first_card()
            self.js("history.back(); true")
            self.wait("!!document.querySelector('.o_kanban_view')")
            self.settle()
            self.assertEqual(self.requests('hashChange'), [{}])

    def test_A32_navigation_params(self):
        # The Community router rewrites a loaded address to its own form and drops unknown
        # parameters, so the history entry that carries the two parameters is made by hand.
        with self.host_session('/odoo/crm', host={}, mobile=True):
            self.wait("!!document.querySelector('.o_kanban_record')")
            self.js("""(() => {
                history.pushState(null, '', '/odoo/crm?view_type=list&cwm_probe=7');
                history.pushState(null, '', '/odoo/crm');
                history.back();
                return true;
            })()""")
            self.wait("(window.__cwmHostLog || []).some((e) => e.action === 'hashChange')")
            args = self.requests('hashChange')[0]
            self.assertEqual(args.get('view_type'), 'list')
            self.assertEqual(args.get('cwm_probe'), 7)
            self.assertIsInstance(args['cwm_probe'], int)


@tagged('post_install', '-at_install')
class TestBackButton(CwmDeviceCase):

    def test_A33_popover_back(self):
        with self.host_session(host={}, mobile=True):
            href = self.js('location.href')
            self.js("window.__cwmHistory = history.length; true")
            self.add_probe('popover')
            self.wait("!!document.querySelector('.o_cwm_probe')")
            self.wait_flips([True])
            self.press_back()
            self.wait("!document.querySelector('.o_cwm_probe')")
            self.wait_flips([True, False])
            self.assertEqual(self.js('location.href'), href)
            self.assertEqual(self.js('history.length === window.__cwmHistory'), True)

    def test_A33_activity_popover(self):
        if not self._is_installed('crm'):
            self.skipTest('crm is not installed')
        with self.host_session('/odoo/crm', host={}, mobile=True):
            self.wait("!!document.querySelector('.o_kanban_record .o-mail-ActivityButton')")
            href = self.js('location.href')
            self.js(
                "document.querySelector('.o_kanban_record .o-mail-ActivityButton').click(); true")
            self.wait("!!document.querySelector('.o_popover, .o_bottom_sheet')")
            self.wait_flips([True])
            self.press_back()
            self.wait("!document.querySelector('.o_popover, .o_bottom_sheet')")
            self.wait_flips([True, False])
            self.assertEqual(self.js('location.href'), href)

    def test_A34_layered_back(self):
        with self.host_session(host={}, mobile=True):
            self.js(f"""(() => {{
                const {{ AlertDialog }} = {MODULE}(
                    "@web/core/confirmation_dialog/confirmation_dialog");
                {ENV}.services.dialog.add(AlertDialog, {{ title: "Layer", body: "one" }});
                return true;
            }})()""")
            self.wait("!!document.querySelector('.modal')")
            self.wait_flips([True])
            self.add_probe('popover', anchor='.modal-body')
            self.wait("!!document.querySelector('.o_cwm_probe')")
            self.frames()  # the popover registered its back handling
            self.press_back()
            self.wait("!document.querySelector('.o_cwm_probe')")
            self.frames()
            self.assertTrue(self.js("!!document.querySelector('.modal')"))
            self.assertEqual(self.flips(), [True])
            self.frames()
            self.press_back()
            self.wait("!document.querySelector('.modal')")
            self.wait_flips([True, False])

    def test_A35_no_back(self):
        with self.host_session(host=without('overrideBackButton'), mobile=True):
            self.add_probe('popover')
            self.wait("!!document.querySelector('.o_cwm_probe')")
            self.js("window.__cwmClosers.probe(); true")
            self.wait("!document.querySelector('.o_cwm_probe')")
            self.settle()
            self.assertEqual(self.requests('overrideBackButton'), [])
        with self.host_session(host={}, ua=self.UA_DESKTOP):
            self.add_probe('popover')
            self.wait("!!document.querySelector('.o_cwm_probe')")
            self.js("window.__cwmClosers.probe(); true")
            self.wait("!document.querySelector('.o_cwm_probe')")
            self.settle()
            self.assertEqual(self.requests('overrideBackButton'), [])

    def test_A63_late_back(self):
        # The Community bottom sheet turns its back handling on only once it is positioned
        # and off as soon as it is being dismissed (see bottom_sheet.js).
        with self.host_session(host={}, mobile=True):
            self.add_probe('bottom_sheet')
            self.wait("!!document.querySelector('.o_cwm_probe')")
            self.wait_flips([True])
            self.press_back()
            self.wait("!document.querySelector('.o_cwm_probe')")
            self.wait_flips([True, False])
