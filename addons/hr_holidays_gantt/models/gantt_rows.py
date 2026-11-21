# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import api, models
from odoo.exceptions import UserError


class HhgGanttRows(models.AbstractModel):
    """What the data call of the time-off requests and of the report have in common."""

    _name = 'hhg.gantt.rows'
    _description = 'Time Off Gantt Rows'

    @api.model
    def _hhg_scaled(self, start_date, stop_date, scale):
        """The model with the displayed scale in its context (decision D1).

        Both paths of the call read their records with it, so the pill's text follows the
        scale whatever the search holds. A call without its period is refused.
        """
        if not start_date or not stop_date:
            raise UserError(self.env._("The data call needs the period it is made for."))
        return self.with_context(scale=scale)

    @api.model
    def _hhg_every_employee(self, groupby):
        """Whether employees without requests get rows (R13 point 1).

        The view is grouped by the employee alone and every condition of the user's own search,
        as the client sent it, is about the employee.
        """
        user_domain = self.env.context.get('user_domain') or []
        return list(groupby or []) == ['employee_id'] and self._hrg_concerns_only(
            user_domain, 'employee_id')
