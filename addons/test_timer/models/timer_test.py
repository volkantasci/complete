# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import fields, models


class TimerTest(models.Model):
    _name = 'timer.test'
    _inherit = ['timer.mixin']
    _description = 'Timer Model'

    name = fields.Char(required=True)
    hours_logged = fields.Float('Hours Already Logged')


class TimerTestInterruption(models.Model):
    _name = 'timer.test.interruption'
    _inherit = ['timer.mixin']
    _description = 'Interruption Timer Model'

    def _action_interrupt_user_timers(self):
        self.action_timer_stop()


class TimerTestRestricted(models.Model):
    _name = 'timer.test.restricted'
    _inherit = ['timer.mixin']
    _description = 'Restricted Timer Model'

    name = fields.Char()


class TimerTestParent(models.Model):
    _name = 'timer.test.parent'
    _inherit = ['timer.parent.mixin']
    _description = 'Parent Timer Model'

    name = fields.Char()

    def _create_record_to_start_timer(self):
        return self.env['timer.test'].create({'name': self.name or 'Child'})


class TimerTestParentEmpty(models.Model):
    _name = 'timer.test.parent.empty'
    _inherit = ['timer.parent.mixin']
    _description = 'Parent Timer Model Without Child'

    name = fields.Char()


class TimerTestParentRestricted(models.Model):
    _name = 'timer.test.parent.restricted'
    _inherit = ['timer.parent.mixin']
    _description = 'Restricted Parent Timer Model'

    name = fields.Char()

    def _create_record_to_start_timer(self):
        return self.env['timer.test'].create({'name': 'Child'})
