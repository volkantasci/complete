# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""The two server methods behind the leave view's split tool (002e2 R17, D8, D10)."""

import re
from datetime import date

from odoo import fields, models
from odoo.api import SUPERUSER_ID
from odoo.exceptions import AccessError, UserError

_ISO_DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
_OFFICER = "hr_holidays.group_hr_holidays_user"


class HrLeave(models.Model):
    _inherit = "hr.leave"

    hhg_split_source_id = fields.Many2one(
        "hr.leave", string="Divided from", copy=False, index=True, readonly=True,
        ondelete="set null", groups="base.group_system")
    hhg_split_record = fields.Json(
        string="Divisions made", copy=False, readonly=True, groups="base.group_system")

    def _hhg_check_split_caller(self):
        """One request, and a caller of the Officer group or above (D10)."""
        self.ensure_one()
        if not self.env.su and not self.env.user.has_group(_OFFICER):
            raise AccessError(
                self.env._("Only a Time Off officer may divide a request or join it again."))

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
            raise UserError(self.env._("The day to divide at must be given as YYYY-MM-DD."))
        try:
            day = date.fromisoformat(split_day)
        except ValueError:
            raise UserError(self.env._("The day to divide at is not a date.")) from None
        former = self._hhg_end_values()
        if day <= self.request_date_from or day > self.request_date_to:
            return {"new_ids": [], **former}
        # the Community's split amends this request's leave and creates the new part's own
        # (its fast creation of an Approved request makes it), so each part has one over its
        # own days (D8)
        created = self._split_leaves(day)
        # the server's own record of where the parts come from and of the end this request
        # had before (D12): the undo writes back these values, not the caller's
        quiet = {"tracking_disable": True, "leave_skip_state_check": True}
        created.sudo().with_context(**quiet).write({"hhg_split_source_id": self.id})
        if created:
            record = dict(self.sudo().hhg_split_record or {})
            record.update({str(part_id): former for part_id in created.ids})
            self.sudo().with_context(**quiet).write({"hhg_split_record": record})
        return {"new_ids": created.ids, **former}

    def _hhg_remove_split_parts(self, parts):
        """Delete the parts a split made, with the Community's own deletion as the system
        user. This is the only step of the undo that runs with raised rights: the Community
        lets only an administrator delete an Approved request (D13), yet the parts are the
        ones the split made for this caller. The caller has already checked each part."""
        parts.with_user(SUPERUSER_ID).unlink()

    def hhg_rejoin_request(self, new_ids, end_day, end_period, end_hour=None):
        """Undo a cut: delete the requests this request's split made that still exist and
        write the former end back; ``False`` when this request no longer exists (D12, D13)."""
        self._hhg_check_split_caller()
        if not self.exists():
            return False
        if not isinstance(end_day, str) or not _ISO_DAY.fullmatch(end_day):
            raise UserError(self.env._("The former end day must be given as YYYY-MM-DD."))
        try:
            date.fromisoformat(end_day)
        except ValueError:
            raise UserError(self.env._("The former end day is not a date.")) from None
        named = self.browse(new_ids).exists()
        # the link is a bookkeeping value only the system reads
        if any(
            part.sudo().hhg_split_source_id != self
            or part.employee_id != self.employee_id
            or part.work_entry_type_id != self.work_entry_type_id
            or part.state != self.state
            for part in named
        ):
            raise UserError(self.env._("Only the parts cut from this request can be removed."))
        if named.sudo().search_count([("hhg_split_source_id", "in", named.ids)]):
            raise UserError(self.env._(
                "A part was divided again: join its parts first, then this one."))
        # what the split did is the server's to know: the end to write back is the recorded
        # one, and only a split recorded for these ids can be undone (R-C-11)
        record = dict(self.sudo().hhg_split_record or {})
        keys = [str(part_id) for part_id in (new_ids or []) if str(part_id) in record]
        if not keys:
            raise UserError(self.env._("No division of this request is recorded for these parts."))
        former = record[keys[0]]
        if any(record[key] != former for key in keys) or (
            end_day, end_period) != (former["end_day"], former["end_period"]) or (
            end_hour is not None
            and abs((end_hour or 0) - (former["end_hour"] or 0)) > 1e-6
        ):
            raise UserError(self.env._(
                "The end given is not the one this request had before it was divided."))
        self._hhg_remove_split_parts(named)
        # the write-back is the caller's own write, with the Community's checks
        self.with_context(leave_skip_state_check=True).write({
            "request_date_to": former["end_day"],
            "request_date_to_period": former["end_period"],
            "request_hour_to": former["end_hour"] or 0,
        })
        # the split is consumed
        for key in keys:
            record.pop(key)
        self.sudo().with_context(
            tracking_disable=True, leave_skip_state_check=True,
        ).write({"hhg_split_record": record or False})
        return True
