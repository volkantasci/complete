# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import fields, models


class TimerTest(models.Model):
    _name = 'timer.test'
    _description = 'Timer Model'

    name = fields.Char(required=True)
    hours_logged = fields.Float('Hours Already Logged')
