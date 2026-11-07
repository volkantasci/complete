# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import api, fields, models

_MIRRORED = ['user_timer_id', 'timer_start', 'timer_pause', 'is_timer_running']


class TimerMixin(models.AbstractModel):
    _name = 'timer.mixin'
    _description = 'Timer Mixin'

    timer_start = fields.Datetime(
        'Timer Start', compute='_compute_timer_fields', compute_sudo=False, readonly=True)
    timer_pause = fields.Datetime(
        'Timer Last Pause', compute='_compute_timer_fields', compute_sudo=False, readonly=True)
    is_timer_running = fields.Boolean(
        'Is Timer Running', compute='_compute_timer_fields', compute_sudo=False, readonly=True)
    user_timer_id = fields.One2many(
        'timer.timer', string='User Timer', compute='_compute_user_timer_id', compute_sudo=False)

    @api.depends_context('uid')
    def _compute_user_timer_id(self):
        timers_by_id = {}
        ids = [record_id for record_id in self._ids if isinstance(record_id, int)]
        if ids:
            timers = self.env['timer.timer'].search([
                ('res_model', '=', self._name),
                ('res_id', 'in', ids),
                ('user_id', '=', self.env.user.id),
            ])
            for timer in timers:
                timers_by_id[timer.res_id] = timers_by_id.get(timer.res_id, timer) | timer
        no_timer = self.env['timer.timer']
        for record in self:
            record.user_timer_id = timers_by_id.get(record._origin.id or record.id, no_timer)

    @api.depends('user_timer_id')
    @api.depends_context('uid')
    def _compute_timer_fields(self):
        for record in self:
            timer = record.user_timer_id[:1]
            record.timer_start = timer.timer_start
            record.timer_pause = timer.timer_pause
            record.is_timer_running = bool(timer.timer_start and not timer.timer_pause)

    def _invalidate_timer_fields(self):
        self.invalidate_recordset(_MIRRORED)

    def action_timer_start(self):
        self.ensure_one()
        self.sudo()._stop_timer_in_progress()
        self._invalidate_timer_fields()
        timer = self.user_timer_id
        if not timer:
            self._create_timer({'timer_start': fields.Datetime.now()})
        elif timer.timer_start and timer.timer_pause:
            self.action_timer_resume()
        elif not timer.timer_start:
            timer.action_timer_start()
        self._invalidate_timer_fields()

    def action_timer_pause(self):
        for record in self:
            record.user_timer_id.action_timer_pause()
        self._invalidate_timer_fields()

    def action_timer_resume(self):
        self._stop_timer_in_progress()
        self._invalidate_timer_fields()
        for record in self:
            record.user_timer_id.action_timer_resume()
        self._invalidate_timer_fields()

    def action_timer_stop(self):
        self.ensure_one()
        timer = self.user_timer_id
        if not timer:
            return False
        minutes_spent = timer.action_timer_stop()
        timer.unlink()
        self._invalidate_timer_fields()
        return minutes_spent

    def _action_interrupt_user_timers(self):
        """Reaction of a document whose running timer is interrupted: pause it."""
        self.action_timer_pause()

    def _get_timer_vals(self):
        return {
            'timer_start': False,
            'timer_pause': False,
            'res_model': self._name,
            'res_id': self.id,
            'user_id': self.env.user.id,
        }

    def _create_timer(self, vals=None):
        return self.env['timer.timer'].create({**self._get_timer_vals(), **(vals or {})})

    def _get_user_timers(self):
        return self.env['timer.timer'].search([('user_id', '=', self.env.user.id)])

    def _get_timers_from_other_users(self):
        return self.env['timer.timer'].sudo().search([
            ('res_model', '=', self._name),
            ('res_id', 'in', self.ids),
            ('user_id', '!=', self.env.user.id),
        ])

    def unlink(self):
        self.check_access('unlink')
        timers = self._get_timers_from_other_users() | self.env['timer.timer'].sudo().search([
            ('res_model', '=', self._name),
            ('res_id', 'in', self.ids),
            ('user_id', '=', self.env.user.id),
        ])
        timers.sudo().unlink()
        return super().unlink()

    def _stop_timer_in_progress(self):
        for timer in self._get_user_timers().filtered('is_timer_running'):
            document = timer._get_related_document()
            if document:
                document._action_interrupt_user_timers()
