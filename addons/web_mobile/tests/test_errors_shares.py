# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import time

from odoo.tests import tagged

from .mobile_host import CwmHostCase

PNG = (
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5E'
    'rkJggg=='
)
SHARE_MODULES = (
    'account', 'crm', 'hr_expense', 'hr_holidays', 'project', 'project_todo',
)
NOTICE_ALL = "The files shared with the app could not be loaded."
NOTICE_ONE = 'The shared file "%s" could not be loaded from the app.'


class CwmShareCase(CwmHostCase):

    def installed(self, *names):
        return all(
            self.env['ir.module.module'].search_count(
                [('name', '=', name), ('state', '=', 'installed')])
            for name in names)

    def any_share_module(self):
        return any(self.installed(name) for name in SHARE_MODULES)

    def settle(self, seconds=1.5):
        time.sleep(seconds)

    def notices(self):
        return self.js("[...document.querySelectorAll('.o_notification')]"
                       ".map((n) => n.textContent.trim())")

    def dialog_open(self):
        return self.js("!!document.querySelector('.modal .btn-primary[data-hotkey=\"S\"]')")


@tagged('post_install', '-at_install')
class TestErrorReport(CwmHostCase):

    def throw_later(self):
        self.js("setTimeout(() => { throw new Error('cwm boom'); }, 0); true")

    def test_A36_error_report(self):
        with self.host_session(host={}):
            self.throw_later()
            self.wait("!!document.querySelector('.o_error_dialog')")
            self.wait("(window.__cwmHostLog || []).some((e) => e.action === 'crashManager')")
            requests = self.host_requests('crashManager')
            self.assertEqual(len(requests), 1)
            args = requests[0]['args']
            self.assertIn('name', args)
            self.assertIn('traceback', args)
            self.assertIn('originalError', args)
            self.assertIn('cwm boom', args['traceback'])
            self.assertEqual(self.console_entries(), [])

    def test_A66_failed_error_report(self):
        with self.host_session(host={'answers': {'crashManager': 'fail'}}):
            self.throw_later()
            self.wait("!!document.querySelector('.o_error_dialog')")
            self.wait("(window.__cwmHostLog || []).some((e) => e.action === 'crashManager')")
            deadline = time.time() + 15
            while time.time() < deadline and not self.console_entries():
                time.sleep(0.2)
            entries = self.console_entries()
            self.assertEqual(len(entries), 1, entries)
            self.assertEqual(entries[0]['type'], 'warning')
            self.assertEqual(len(self.host_requests('crashManager')), 1)

    def test_A66_cyclic_error(self):
        with self.host_session(host={}):
            self.js("""setTimeout(() => {
                const error = new Error('cwm cyclic');
                error.self = error;
                throw error;
            }, 0); true""")
            self.wait("!!document.querySelector('.o_error_dialog')")
            time.sleep(1)
            self.assertEqual(self.host_requests('crashManager'), [])
            self.assertEqual(len(self.console_entries()), 1, self.console_entries())


@tagged('post_install', '-at_install')
class TestSharedFiles(CwmShareCase):

    def test_A37_shared_file_dialog(self):
        if not self.installed('hr_expense'):
            self.skipTest('hr_expense is not installed')
        host = {
            'files': [{'uri': 'cwm-1', 'name': 'receipt.png', 'type': 'image/png'}],
            'fileBase64': PNG,
        }
        before = self.env['ir.attachment'].search_count([('name', '=', 'receipt.png')])
        with self.host_session(host=host):
            self.wait("!!document.querySelector('.modal .btn-primary[data-hotkey=\"S\"]')")
            self.assertEqual(self.js('window.__cwmHostFetches'), ['cwm-1'])
            self.js("""(() => {
                const button = [...document.querySelectorAll('.modal .btn')]
                    .find((b) => b.textContent.trim() === 'Expense');
                button.click();
                return true;
            })()""")
            self.js(
                "document.querySelector('.modal .btn-primary[data-hotkey=\"S\"]').click(); true")
            deadline = time.time() + 30
            while time.time() < deadline:
                attachments = self.env['ir.attachment'].sudo().search([
                    ('name', '=', 'receipt.png'), ('res_model', '=', 'hr.expense'),
                ])
                if attachments:
                    break
                time.sleep(0.5)
            self.assertTrue(attachments, 'no expense received the attachment')
            self.assertTrue(self.env['hr.expense'].browse(attachments.mapped('res_id')).exists())
        self.assertGreaterEqual(
            self.env['ir.attachment'].search_count([('name', '=', 'receipt.png')]), before + 1)

    def test_A38_unreadable(self):
        if not self.any_share_module():
            self.skipTest('no share item module installed')
        host = {
            'files': [{'uri': 'cwm-bad', 'name': 'bad.pdf', 'type': 'application/pdf'}],
            'fileStatus': {'cwm-bad': 404},
        }
        with self.host_session(host=host):
            self.wait("!!document.querySelector('.o_notification')")
            self.settle()
            self.assertEqual(self.notices(), [NOTICE_ONE % 'bad.pdf'])
            self.assertFalse(self.dialog_open())

    def test_A39_no_files(self):
        if not self.any_share_module():
            self.skipTest('no share item module installed')
        with self.host_session(host={'files': []}):
            self.wait("(window.__cwmHostLog || []).some((e) => e.action === 'getShareTargetFiles')")
            self.settle()
            self.assertEqual(self.notices(), [])
            self.assertFalse(self.dialog_open())
        with self.host_session(host={'answers': {'getShareTargetFiles': 'fail'}}):
            self.wait("!!document.querySelector('.o_notification')")
            self.settle()
            self.assertEqual(self.notices(), [NOTICE_ALL])
            self.assertFalse(self.dialog_open())

    def test_A39_no_share_destination(self):
        if self.any_share_module():
            self.skipTest('a share item module is installed')
        files = [{'uri': 'u', 'name': 'a.png', 'type': 'image/png'}]
        with self.host_session(host={'files': files}):
            self.settle()
            self.assertEqual(self.host_requests('getShareTargetFiles'), [])
            self.assertEqual(self.notices(), [])
            self.assertFalse(self.dialog_open())
