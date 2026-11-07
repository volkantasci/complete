# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import api, fields, models


class TimerTimer(models.Model):
    _name = 'timer.timer'
    _description = 'Timer Module'

    timer_start = fields.Datetime('Timer Start')
    timer_pause = fields.Datetime('Timer Last Pause')
    is_timer_running = fields.Boolean('Is Timer Running', compute='_compute_is_timer_running')
    res_model = fields.Char('Document Model', required=True)
    res_id = fields.Integer('Document', required=True)
    user_id = fields.Many2one('res.users', string='User')
    parent_res_model = fields.Char('Parent Document Model')
    parent_res_id = fields.Integer('Parent Document')

    _unique_timer = models.Constraint(
        'UNIQUE(res_model, res_id, user_id)',
        'A user can have only one timer per record.',
    )

    @api.depends('timer_start', 'timer_pause')
    def _compute_is_timer_running(self):
        for timer in self:
            timer.is_timer_running = bool(timer.timer_start and not timer.timer_pause)

    @api.model_create_multi
    def create(self, vals_list):
        timers = super().create(vals_list)
        timers._invalidate_document_timers()
        return timers

    def _invalidate_document_timers(self):
        """Refresh the cached current-user timer of each document and its parent."""
        for timer in self:
            for model, res_id in (
                (timer.res_model, timer.res_id),
                (timer.parent_res_model, timer.parent_res_id),
            ):
                if not model or not res_id or model not in self.env:
                    continue
                if 'user_timer_id' in self.env[model]._fields:
                    self.env[model].browse(res_id).invalidate_recordset(['user_timer_id'])

    def action_timer_start(self):
        for timer in self:
            if not timer.timer_start:
                timer.timer_start = fields.Datetime.now()

    def action_timer_pause(self):
        for timer in self:
            if timer.is_timer_running:
                timer.timer_pause = fields.Datetime.now()

    def action_timer_resume(self):
        for timer in self:
            if timer.timer_start and timer.timer_pause:
                timer.write({
                    'timer_start': timer.timer_start + (fields.Datetime.now() - timer.timer_pause),
                    'timer_pause': False,
                })

    def action_timer_stop(self):
        self.ensure_one()
        if not self.timer_start:
            return False
        minutes_spent = self._get_minutes_spent()
        self.write({'timer_start': False, 'timer_pause': False})
        return minutes_spent

    @api.model
    @api.readonly
    def get_server_time(self):
        return fields.Datetime.now()

    def _get_timers(self):
        return self.search([('user_id', '=', self.env.user.id)])

    def _get_related_document(self):
        self.ensure_one()
        return self.env[self.res_model].browse(self.res_id)

    def _get_minutes_spent(self):
        self.ensure_one()
        if not self.timer_start:
            return 0.0
        end = self.timer_pause or fields.Datetime.now()
        return (end - self.timer_start).total_seconds() / 60
