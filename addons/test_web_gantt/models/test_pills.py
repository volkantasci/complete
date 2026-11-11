# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import fields, models


class TestWebGanttPill(models.Model):
    _name = 'test.web.gantt.pill'
    _description = 'Test Web Gantt Pill'

    active = fields.Boolean(default=True)
    name = fields.Char()
    dependency_field = fields.Many2many(
        'test.web.gantt.pill', relation='web_gantt_test_pill_dep',
        column1='slave', column2='master', string='De')
    dependency_inverted_field = fields.Many2many(
        'test.web.gantt.pill', relation='web_gantt_test_pill_dep',
        column1='master', column2='slave')
    date_start = fields.Datetime('Start Datetime')
    date_stop = fields.Datetime('Stop Datetime')
    parent_id = fields.Many2one('test.web.gantt.pill', string='Parent')
    pill_properties_definition = fields.PropertiesDefinition('Pill Properties Definition')
    pill_properties = fields.Properties(
        'Pill Properties', definition='parent_id.pill_properties_definition', copy=True)


class TestWebGanttPill2(models.Model):
    _name = 'test.web.gantt.pill2'
    _description = 'Test Web Gantt Pill 2'

    active = fields.Boolean(default=True)
    name = fields.Char()
    dependency_field = fields.Many2many(
        'test.web.gantt.pill2', relation='web_gantt_test_pill_2_dep',
        column1='slave', column2='master', string='De')
    dependency_inverted_field = fields.Many2many(
        'test.web.gantt.pill2', relation='web_gantt_test_pill_2_dep',
        column1='master', column2='slave')
    date_start = fields.Date('Start Date')
    date_stop = fields.Date('Stop Date')
    parent_id = fields.Many2one('test.web.gantt.pill2', string='Parent')
