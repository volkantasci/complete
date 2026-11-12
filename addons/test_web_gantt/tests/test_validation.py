# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.exceptions import ValidationError
from odoo.tests.common import TransactionCase
from odoo.tools import mute_logger

GOOD = 'date_start="date_start" date_stop="date_stop"'


class TestValidation(TransactionCase):
    def _save(self, arch):
        return self.env['ir.ui.view'].create({
            'name': 'Pill gantt check',
            'model': 'test.web.gantt.pill',
            'type': 'gantt',
            'arch': arch,
        })

    def _refuse(self, arch, pattern):
        with mute_logger('odoo.addons.base.models.ir_ui_view'), \
                self.assertRaisesRegex(ValidationError, pattern):
            self._save(arch)

    def test_a5_start_and_stop_required(self):
        self._refuse('<gantt date_stop="date_stop"/>', 'start field')
        self._refuse('<gantt date_start="date_start"/>', 'stop field')

    def test_a6_children_and_single_popover(self):
        self._refuse(f'<gantt {GOOD}><button/></gantt>', '<button>')
        self._refuse(f'<gantt {GOOD}><popover/><popover/></gantt>', 'single popover')
        self._save(f'<gantt {GOOD}><field name="name"/><popover/></gantt>')

    def test_a7_default_range_and_scale(self):
        self._refuse(f'<gantt {GOOD} default_range="fortnight"/>', '"fortnight"')
        for value in ('day', 'week', 'month', 'quarter', 'year'):
            self._save(f'<gantt {GOOD} default_range="{value}"/>')
        for value in ('day', 'week', 'week_2', 'month', 'month_3', 'year'):
            self._save(f'<gantt {GOOD} default_scale="{value}"/>')
        self._refuse(f'<gantt {GOOD} default_scale="quarter"/>', '"quarter"')

    def test_a8_display_mode(self):
        self._refuse(f'<gantt {GOOD} display_mode="compact"/>', '"compact"')
        for value in ('dense', 'sparse'):
            self._save(f'<gantt {GOOD} display_mode="{value}"/>')

    def test_a9_dependency_needs_inverted(self):
        self._refuse(
            f'<gantt {GOOD} dependency_field="dependency_field"/>', 'dependency_inverted_field')
        self._save(
            f'<gantt {GOOD} dependency_field="dependency_field" '
            'dependency_inverted_field="dependency_inverted_field"/>')

    def test_a10_unknown_attributes(self):
        self._refuse(f'<gantt {GOOD} colour="x"/>', r'(?s)colour.*date_start')
        with mute_logger('odoo.addons.base.models.ir_ui_view'), \
                self.assertRaises(ValidationError) as caught:
            self._save(f'<gantt {GOOD} colour="x"/>')
        message = str(caught.exception)
        self.assertNotIn('__validate__', message[message.index('Unknown attributes'):])
        everything = (
            'string="T" default_range="week" default_scale="week_2" scales="day,week" '
            'precision="{}" color="parent_id" progress="id" pill_label="1" thumbnails="{}" '
            'display_mode="sparse" total_row="1" progress_bar="parent_id" '
            'display_unavailability="1" groups_limit="5" default_group_by="parent_id" '
            'sample="1" create="1" edit="1" delete="1" form_view_id="1" '
            'on_create="x" cell_create="1" plan="1" multi_create_view="x" '
            'disable_drag_drop="1" dependency_field="dependency_field" '
            'dependency_inverted_field="dependency_inverted_field" '
            'buffer_start="a" buffer_stop="b" schedule="1" class="c" js_class="gantt" '
            'collapse_first_level="1" dynamic_range="1" offset="1" '
            'decoration-danger="1" decoration-warning="1" decoration-success="1" '
            'decoration-info="1" decoration-secondary="1"'
        )
        self._save(f'<gantt {GOOD} {everything}/>')

    def test_a11_popover_content(self):
        self._refuse(f'<gantt {GOOD}><popover><div/></popover></gantt>', '<div>')
        self._refuse(
            f'<gantt {GOOD}><popover><templates/><templates/></popover></gantt>',
            'single templates',
        )
        self._refuse(f'<gantt {GOOD}><popover foo="1"/></gantt>', 'foo')
        self._save(
            f'<gantt {GOOD}><popover card_id="1"><field name="name"/>'
            '<templates><t t-name="popover-body"/></templates></popover></gantt>')

    def test_a115_ignored_options_saved(self):
        self._save(f'<gantt {GOOD} collapse_first_level="1" dynamic_range="1" offset="3"/>')
        self._save(f'<gantt {GOOD} default_scale="week_2"/>')
