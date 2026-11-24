# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from lxml import etree
from odoo.modules.module import get_manifest
from odoo.tests.common import TransactionCase
from odoo.tools import file_open


class TestInstall(TransactionCase):
    def test_module_installed(self):
        module = self.env['ir.module.module'].search([('name', '=', 'test_web_gantt')])
        self.assertEqual(module.state, 'installed')

    def test_data_activates_no_language(self):
        """The data and demo files of the module call nothing that activates a language.

        A language activated by the demo data would reach every database the module is
        installed in with demo data (a verifier's, a screenshot's); tests that need the
        right-to-left user call `_tl_rtl_user` themselves.
        """
        manifest = get_manifest('test_web_gantt')
        files = manifest['data'] + manifest['demo']
        self.assertIn('demo/host_records.xml', files)
        for name in files:
            if not name.endswith('.xml'):
                continue
            with file_open(f'test_web_gantt/{name}', 'rb') as handle:
                root = etree.parse(handle).getroot()
            for node in root.iter('function', 'record'):
                self.assertNotEqual(node.get('model'), 'res.lang', name)
                self.assertNotEqual(node.get('name'), '_tl_rtl_user', name)
                self.assertFalse(
                    (node.get('name') or '').startswith('_activate'), f'{name}: {node.get("name")}')
