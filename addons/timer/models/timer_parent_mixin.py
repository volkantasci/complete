# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import api, models
from odoo.exceptions import MissingError
from odoo.fields import Domain


class ParentTimerSupport(models.AbstractModel):
    _name = 'timer.parent.mixin'
    _inherit = 'timer.mixin'
    _description = 'Parent Timer Mixin'

    def _parent_timer_domain(self, ids):
        return [
            ('parent_res_model', '=', self._name),
            ('parent_res_id', 'in', ids),
        ]

    @api.depends_context('uid')
    def _load_own_timers(self):
        timer_by_parent = {}
        ids = [record_id for record_id in self._ids if isinstance(record_id, int)]
        if ids:
            timers = self._own_timer_search(self._parent_timer_domain(ids), order='id')
            for timer in timers:
                timer_by_parent.setdefault(timer.parent_res_id, timer)
        no_timer = self.env['timer.timer']
        for record in self:
            record.user_timer_id = timer_by_parent.get(record._origin.id or record.id, no_timer)

    @api.model
    def _find_by_running_state(self, operator, value):
        # The ORM normally hands over "in"/"not in" with booleans; "="/"!=" with a
        # boolean are the same question when the method is called directly.
        if operator in ('=', '!='):
            values, positive = [value], operator == '='
        elif operator in ('in', 'not in') and isinstance(value, (list, tuple, set, frozenset)):
            values, positive = list(value), operator == 'in'
        else:
            values, positive = [None], True
        if not values or not all(isinstance(v, bool) for v in values):
            raise NotImplementedError(self.env._("This search on running timers is not supported."))
        values = set(values)
        if len(values) == 2:
            return Domain.TRUE if positive else Domain.FALSE
        wants_running = positive == (True in values)
        timers = self.env['timer.timer'].sudo().search([
            ('parent_res_model', '=', self._name),
            ('timer_start', '!=', False),
            ('timer_pause', '=', False),
        ])
        return Domain('id', 'in' if wants_running else 'not in', timers.mapped('parent_res_id'))

    @api.model
    def _find_by_own_timer(self, operator, value):
        """Parents referenced (or not) by the current user's timers.

        Timer ids are accepted next to ``False``, as the ORM searches with them
        to find the parents to refresh when a timer changes.
        """
        if operator in ('=', '!='):
            values, positive = {value}, operator == '='
        elif operator in ('in', 'not in'):
            values, positive = set(value), operator == 'in'
        else:
            raise NotImplementedError(self.env._("This search on running timers is not supported."))
        timer_ids = [v for v in values if v]
        Timer = self.env['timer.timer'].sudo()
        own = [('parent_res_model', '=', self._name), ('user_id', '=', self.env.user.id)]
        by_id = Timer.search([*own, ('id', 'in', timer_ids)])
        matched = Domain('id', 'in', by_id.mapped('parent_res_id'))
        if False in values:
            started = Timer.search([*own, ('timer_start', '!=', False)])
            matched |= Domain('id', 'not in', started.mapped('parent_res_id'))
        return matched if positive else ~matched

    def action_timer_stop(self):
        self.ensure_one()
        timer = self.user_timer_id[:1]
        if not timer:
            return False
        child = timer._get_related_document()
        if child:
            minutes_spent = child.action_timer_stop()
        else:
            # the child document is gone: clear the orphan timer (R7)
            minutes_spent = timer.sudo().action_timer_stop()
            timer.sudo().unlink()
        self._invalidate_timer_fields()
        return minutes_spent

    def _create_record_to_start_timer(self):
        """Hook: return the child document that carries the timer, or nothing."""
        return None

    def _get_timer_vals(self):
        return {
            'parent_res_model': self._name,
            'parent_res_id': self.id,
        }

    def _create_timer(self, vals=None):
        child = self._create_record_to_start_timer()
        if not child:
            raise MissingError(
                self.env._("A timer needs a record to attach to, and none could be created."))
        return child._create_timer({**self._get_timer_vals(), **(vals or {})})

    def _get_record_with_timer_running(self):
        timer = self.user_timer_id[:1]
        return timer._get_related_document() if timer else self.env['base']

    def _get_timers_from_other_users(self):
        return self.env['timer.timer'].sudo().search([
            *self._parent_timer_domain(self.ids),
            ('user_id', 'not in', self.env.user.ids),
        ])

    def unlink(self):
        self.check_access('unlink')
        timers = self._get_timers_from_other_users() | self.env['timer.timer'].sudo().search([
            *self._parent_timer_domain(self.ids),
            ('user_id', '=', self.env.user.id),
        ])
        timers.sudo().unlink()
        return super().unlink()
