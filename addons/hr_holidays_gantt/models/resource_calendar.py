# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from datetime import datetime, time, timedelta

from odoo import models
from odoo.tools import float_compare


class ResourceCalendar(models.Model):
    _inherit = 'resource.calendar'

    def _handle_flexible_leave_interval(self, dt0, dt1, leave):
        """The interval of a validated leave of a flexible schedule, by request unit (R15).

        ``dt0`` and ``dt1`` are in the employee's time zone. A half-day request follows its
        periods; an hour request follows its hours against the schedule's hours per day (the
        whole days, the morning, the afternoon, or its own hours); any other request keeps the
        Community's whole days.
        """
        request = leave.sudo().holiday_id
        unit = request.work_entry_type_request_unit if request else False
        if unit not in ('half_day', 'hour'):
            return super()._handle_flexible_leave_interval(dt0, dt1, leave)
        tz = dt0.tzinfo
        first = dt0.date()
        # a request ending at midnight ends on the day before
        last = (dt1 - timedelta(microseconds=1)).date()
        day_start = datetime.combine(first, time.min, tzinfo=tz)
        day_end = datetime.combine(last, time.max, tzinfo=tz)
        noon_first = datetime.combine(first, time(12), tzinfo=tz)
        morning_end = datetime.combine(last, time(11, 59, 59, 999999), tzinfo=tz)
        if unit == 'half_day':
            start = noon_first if request.request_date_from_period == 'pm' else day_start
            end = morning_end if request.request_date_to_period == 'am' else day_end
            return start, end
        hours = (dt1 - dt0).total_seconds() / 3600
        # the leave's own resource schedule: ``self`` may be an empty calendar (the batch
        # reads leaves without a calendar)
        own = leave.resource_id.calendar_id or self
        per_day = own.hours_per_day
        if float_compare(hours, per_day, precision_digits=2) == 0:
            return day_start, day_end
        if float_compare(hours, per_day / 2, precision_digits=2) == 0:
            if dt1 <= datetime.combine(last, time(12), tzinfo=tz):
                return day_start, morning_end
            if dt0 >= noon_first:
                return noon_first, day_end
        return dt0, dt1 - timedelta(microseconds=1)
