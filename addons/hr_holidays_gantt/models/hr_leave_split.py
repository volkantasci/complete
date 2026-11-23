# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""The two server methods behind the leave view's split tool (002e2 R17, D8, D10)."""

import re
from datetime import date

from odoo import SUPERUSER_ID, _, models
from odoo.exceptions import AccessError, UserError

_ISO_DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
_OFFICER = "hr_holidays.group_hr_holidays_user"


class HrLeave(models.Model):
    _inherit = "hr.leave"

    def _hhg_check_split_caller(self):
        """One request, and a caller of the Officer group or above (D10)."""
        self.ensure_one()
        if not self.env.su and not self.env.user.has_group(_OFFICER):
            raise AccessError(_("Only a Time Off officer may divide a request or join it again."))

    def _hhg_end_values(self):
        self.ensure_one()
        return {
            "end_day": self.request_date_to.isoformat(),
            "end_period": self.request_date_to_period,
            "end_hour": self.request_hour_to,
        }

    def hhg_cut_request(self, split_day):
        """Divide the request in two at ``split_day`` ("YYYY-MM-DD", the second part's first
        day) with the Community's split; return the new request ids and the former end."""
        self._hhg_check_split_caller()
        if not isinstance(split_day, str) or not _ISO_DAY.fullmatch(split_day):
            raise UserError(_("The day to divide at must be given as YYYY-MM-DD."))
        try:
            day = date.fromisoformat(split_day)
        except ValueError:
            raise UserError(_("The day to divide at is not a date.")) from None
        former = self._hhg_end_values()
        if day <= self.request_date_from or day > self.request_date_to:
            return {"new_ids": [], **former}
        created = self._split_leaves(day)
        if self.state == "validate":
            # the Community's fast creation of the new part skips its leave: each part gets
            # its own, over its own days, as at the final approval (D8)
            (self | created).sudo()._create_resource_leave()
        return {"new_ids": created.ids, **former}

    def hhg_rejoin_request(self, new_ids, end_day, end_period, end_hour=None):
        """Undo a cut: delete the new requests that still exist and write the former end
        back; ``False`` when this request no longer exists."""
        if not self.exists():
            return False
        self._hhg_check_split_caller()
        free = self.with_context(leave_skip_state_check=True)
        parts = free.browse(new_ids).exists()
        if not isinstance(end_day, str) or not _ISO_DAY.fullmatch(end_day):
            raise UserError(_("The former end day must be given as YYYY-MM-DD."))
        former_end = date.fromisoformat(end_day)
        # only the parts of this cut: another request is never removed by an undo
        if any(
            part == self
            or part.employee_id != self.employee_id
            or part.work_entry_type_id != self.work_entry_type_id
            or part.state != self.state
            or part.request_date_from <= self.request_date_to
            or part.request_date_to > former_end
            for part in parts
        ):
            raise UserError(_("Only the parts cut from this request can be removed."))
        # the Community lets only an administrator delete an Approved request; the parts
        # are the ones the cut made for this officer, so their removal runs as the Community's
        # own deletion as the system user
        parts.with_user(SUPERUSER_ID).unlink()
        values = {
            "request_date_to": end_day,
            "request_date_to_period": end_period,
        }
        if end_hour is not None:
            values["request_hour_to"] = end_hour or 0
        free.write(values)
        if self.state == "validate":
            self.sudo()._create_resource_leave()
        return True
