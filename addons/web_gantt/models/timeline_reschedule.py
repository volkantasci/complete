# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Rescheduling along dependencies (spec 002c R17 to R21) and its Undo.

Every model gets the server method ``web_gantt_reschedule``, the rollback method
``action_rollback_scheduling`` and the overridable steps listed in ``model.md``.
Models whose start and stop are datetimes are handled in their own instants. A date-only
model (R26) is handled in the same steps in a "working space" of whole days: a record covers
the instants from 00:00 of its start day to 00:00 of the day after its stop day (the end of the
stop day) in the user's time zone, expressed in local naive datetimes, so a day is exactly 24 h.
Durations, free time, bounds and the shift of a stop then come out in whole days, the day after
a stop is the earliest start, the day before a start is the latest end, and a start day on or
before the blocker's stop day is a conflict. Only the comparison with the server's time and the
values written back convert out of that space.
"""
from datetime import datetime, time, timedelta

import pytz
from odoo import Command, _, api, fields, models
from odoo.exceptions import UserError

CONSUME_BUFFER = 'consumeBuffer'
MAINTAIN_BUFFER = 'maintainBuffer'
FORWARD = 'forward'
BACKWARD = 'backward'
LOOP_ERROR = 'loop_error'
PAST_ERROR = 'past_error'

# a candidate may start up to this long before the server's time without being "in the past"
PAST_TOLERANCE = timedelta(seconds=30)


class Base(models.AbstractModel):
    _inherit = 'base'

    # ------------------------------------------------------------------ instants (R26)

    @api.model
    def _tl_instant(self, value, field_name, is_stop):
        """The working instant of a stored or given value: the value itself for a datetime
        field; for a date field the start of the day, or the end of the day for a stop."""
        if not value:
            return False
        if self._fields[field_name].type != 'date':
            return fields.Datetime.to_datetime(value)
        instant = datetime.combine(fields.Date.to_date(value), time.min)
        return instant + timedelta(days=1) if is_stop else instant

    def _tl_start(self, start_field):
        self.ensure_one()
        return self._tl_instant(self[start_field], start_field, False)

    def _tl_stop(self, stop_field):
        self.ensure_one()
        return self._tl_instant(self[stop_field], stop_field, True)

    @api.model
    def _tl_to_field_value(self, instant, field_name, is_stop):
        """The value to write for a working instant (a stop of a date field is the day
        before the end instant)."""
        if self._fields[field_name].type != 'date':
            return instant
        return (instant - timedelta(days=1)).date() if is_stop else instant.date()

    def _tl_text(self, field_name):
        """The stored value as the text of the old values (R21)."""
        self.ensure_one()
        value = self[field_name]
        if not value:
            return False
        if self._fields[field_name].type == 'date':
            return fields.Date.to_string(value)
        return fields.Datetime.to_string(value)

    @api.model
    def _tl_now(self, start_field):
        """The server's time in the working space: UTC for datetimes, the user's local time
        for date-only models."""
        now = fields.Datetime.now()
        if self._fields[start_field].type != 'date':
            return now
        zone = self.env.user.tz or self.env.context.get('tz')
        try:
            tz = pytz.timezone(zone) if zone else pytz.utc
        except pytz.UnknownTimeZoneError:
            tz = pytz.utc
        return pytz.utc.localize(now).astimezone(tz).replace(tzinfo=None)

    @api.model
    def _tl_past_tolerance(self, start_field):
        return timedelta(0) if self._fields[start_field].type == 'date' else PAST_TOLERANCE

    # ------------------------------------------------------------------ entry points

    @api.model
    def web_gantt_reschedule(
        self, values, method, record_ids, dependency_field, inverted_field,
        start_field, stop_field,
    ):
        """Move or resize one record and move the records that depend on it.

        Answers ``{'type', 'message', 'old_vals_per_pill_id'}`` (R21).
        """
        if method not in (CONSUME_BUFFER, MAINTAIN_BUFFER):
            raise UserError(_("Unknown rescheduling method: %s", method))
        if isinstance(record_ids, (list, tuple)):
            record_ids = record_ids[0] if record_ids else False
        record = self.browse(record_ids).exists()
        record.ensure_one()
        values = record.web_gantt_format_property_fields(dict(values or {}))

        if self._tl_is_plain_write(record, values, dependency_field, inverted_field,
                                   start_field, stop_field):
            old = {record.id: record._tl_keep_old_values(values)}
            record.write(values)
            return self._tl_answer([], [], old)

        with self.env.cr.savepoint() as guard:
            errors, warnings, old = record._web_gantt_action_reschedule_candidates(
                values, method, dependency_field, inverted_field, start_field, stop_field)
            if errors:
                guard.rollback()
        if errors:
            self.env.invalidate_all()
            return self._tl_answer(errors, warnings, {})
        return self._tl_answer(errors, warnings, old)

    def action_rollback_scheduling(self, old_vals_per_pill_id):
        """Write back the old values of a rescheduling (Undo, R21)."""
        for key, old_values in (old_vals_per_pill_id or {}).items():
            if not old_values:
                continue
            record = self.browse(int(key)).exists()
            if not record:
                continue
            values = {}
            for name, value in old_values.items():
                field = record._fields.get(name)
                if field and field.type in ('one2many', 'many2many') and isinstance(value, list):
                    value = [Command.set(value)]
                values[name] = value
            record.write(values)

    # ------------------------------------------------------------------ answer

    @api.model
    def _tl_answer(self, errors, warnings, old_values):
        if errors or warnings:
            message = self._web_gantt_get_reschedule_message(errors, warnings)
            return {
                'type': 'warning',
                'message': message,
                'old_vals_per_pill_id': {} if errors else old_values,
            }
        return {
            'type': 'success',
            'message': self._web_gantt_get_reschedule_message([], []),
            'old_vals_per_pill_id': old_values,
        }

    @api.model
    def _web_gantt_get_reschedule_message_per_key(self, key, record=None):
        if key == LOOP_ERROR:
            return _("These dependencies form a loop, so nothing was moved")
        if key == PAST_ERROR:
            return _(
                "Could not move %(record)s: it would start in the past",
                record=record.display_name if record else '')
        return key

    @api.model
    def _web_gantt_get_reschedule_message(self, errors, warnings):
        """Errors and warnings are lists of ``(key, record)`` pairs; no error: the warnings."""
        entries = errors or warnings
        if not entries:
            return _("Records rescheduled")
        lines = []
        for key, record in entries:
            line = self._web_gantt_get_reschedule_message_per_key(key, record)
            if line not in lines:
                lines.append(line)
        return '\n'.join(lines)

    # ------------------------------------------------------------------ plain write (R17)

    @api.model
    def _tl_is_plain_write(self, record, values, dependency_field, inverted_field,
                           start_field, stop_field):
        if stop_field not in values or not dependency_field or not inverted_field:
            return True
        # a record without both dates, or left without them, is not rescheduled (E5)
        if not (record[start_field] and record[stop_field]):
            return True
        if not values[stop_field]:
            return True
        if start_field not in values:
            # only a new stop (R17): the stored start is not compared with the server's time
            return False
        new_start = record._tl_instant(values[start_field], start_field, False)
        if not new_start:
            return True
        return new_start < record._tl_now(start_field)

    def _tl_keep_old_values(self, values):
        """The values of the fields in ``values`` before the write (R21): relations as ids,
        dates as text, a property field whole."""
        self.ensure_one()
        names = [name for name in values if name in self._fields]
        if not names:
            return {}
        row = self.read(names, load=False)[0]
        old = {}
        for name in names:
            value = row[name]
            field = self._fields[name]
            if field.type == 'datetime':
                value = fields.Datetime.to_string(value) if value else False
            elif field.type == 'date':
                value = fields.Date.to_string(value) if value else False
            old[name] = value
        return old

    def web_gantt_format_property_fields(self, values):
        """Merge values of property sub-fields (``field.name``) into the whole property field
        so the record's other properties are kept (E6)."""
        self.ensure_one()
        merged = {}
        for key in list(values):
            field_name, dot, sub = key.partition('.')
            if not dot or field_name not in self._fields \
                    or self._fields[field_name].type != 'properties':
                continue
            merged.setdefault(field_name, []).append((sub, values.pop(key)))
        for field_name, updates in merged.items():
            whole = values.get(field_name)
            if not isinstance(whole, list):
                whole = self.read([field_name])[0][field_name] or []
            whole = [dict(item) for item in whole]
            for sub, value in updates:
                for item in whole:
                    if item.get('name') == sub:
                        item['value'] = value
            values[field_name] = whole
        return values

    # ------------------------------------------------------------------ overridable steps

    def _web_gantt_reschedule_can_record_be_rescheduled(self, start_field, stop_field):
        self.ensure_one()
        return bool(self[start_field] and self[stop_field]
                    and self._tl_start(start_field) > self._tl_now(start_field))

    def _web_gantt_reschedule_is_record_candidate(self, start_field, stop_field):
        return self._web_gantt_reschedule_can_record_be_rescheduled(start_field, stop_field)

    def _web_gantt_record_has_dependencies(self):
        return True

    def _web_gantt_reschedule_compute_dates(self, best_date, forward, start_field, stop_field):
        """New (start, stop) keeping the duration, from ``best_date`` forward or backward
        (working instants: whole days for a date-only model)."""
        self.ensure_one()
        duration = self._tl_stop(stop_field) - self._tl_start(start_field)
        if forward:
            return best_date, best_date + duration
        return best_date - duration, best_date

    def _web_gantt_reschedule_write_new_dates(self, new_start, new_stop, start_field, stop_field):
        """Write the dates unless the start is more than 30 s in the past; say whether it did."""
        self.ensure_one()
        if new_start < self._tl_now(start_field) - self._tl_past_tolerance(start_field):
            return False
        self.write({
            start_field: self._tl_to_field_value(new_start, start_field, False),
            stop_field: self._tl_to_field_value(new_stop, stop_field, True),
        })
        return True

    def _web_gantt_get_direction(self, values, start_field, stop_field):
        """Forward when the new start (only the stop given: the new stop) is later."""
        self.ensure_one()
        if start_field in values:
            later = self._tl_instant(values[start_field], start_field, False) \
                > self._tl_start(start_field)
        else:
            later = self._tl_instant(values[stop_field], stop_field, True) \
                > self._tl_stop(stop_field)
        return FORWARD if later else BACKWARD

    def _web_gantt_is_candidate_in_conflict(
            self, dependency_field, inverted_field, start_field, stop_field):
        """Use buffer: the start is before a blocker's stop, or the stop after the start of a
        record it blocks (records with both dates, values written so far)."""
        self.ensure_one()
        start, stop = self._tl_start(start_field), self._tl_stop(stop_field)
        for blocker in self[dependency_field]:
            if blocker[start_field] and blocker[stop_field] \
                    and start < blocker._tl_stop(stop_field):
                return True
        for blocked in self[inverted_field]:
            if blocked[start_field] and blocked[stop_field] \
                    and stop > blocked._tl_start(start_field):
                return True
        return False

    def _web_gantt_action_reschedule_candidates(self, values, method, dependency_field,
                                                inverted_field, start_field, stop_field):
        """Direction, candidate search and move for the moved record ``self`` (R18, R19).

        Returns ``(errors, warnings, old_values)``.
        """
        self.ensure_one()
        direction = self._web_gantt_get_direction(values, start_field, stop_field)
        only_stop = start_field not in values
        follow = inverted_field if direction == FORWARD or only_stop else dependency_field
        candidates, looping = self._tl_gather_candidates(follow, start_field, stop_field)
        if looping:
            return [(LOOP_ERROR, self)], [], {}
        mover = self._web_gantt_move_candidates
        return mover(candidates, values, method, direction,
                     dependency_field, inverted_field, start_field, stop_field)

    def _tl_gather_candidates(self, relation, start_field, stop_field):
        """Candidates reached from ``self`` through ``relation``, each after all the
        candidates leading to it; with ``True`` as second item when a cycle is met (R18)."""
        self.ensure_one()
        finished = []          # post-order
        seen = {self.id}
        on_path = {self.id}
        stack = [(self, iter(self[relation].sorted('id')))]
        expandable = lambda rec: rec._web_gantt_record_has_dependencies()  # noqa: E731
        while stack:
            node, children = stack[-1]
            if not expandable(node):
                children = iter(())
            child = next(children, None)
            if child is None:
                stack.pop()
                on_path.discard(node.id)
                if node != self:
                    finished.append(node)
                continue
            if child.id in on_path:
                return [], True
            if child.id in seen:
                continue
            seen.add(child.id)
            if not child._web_gantt_reschedule_is_record_candidate(start_field, stop_field):
                continue
            on_path.add(child.id)
            stack.append((child, iter(child[relation].sorted('id'))))
        return finished[::-1], False

    def _web_gantt_move_candidates(
            self, candidates, values, method, direction, dependency_field, inverted_field,
            start_field, stop_field):
        """Write the moved record ``self`` then the candidates in order (R19, R20).

        Returns ``(errors, warnings, old_values)``.
        """
        self.ensure_one()
        keep_buffer = method == MAINTAIN_BUFFER
        forward = direction == FORWARD
        only_stop = start_field not in values
        old_values = {self.id: self._tl_keep_old_values(values)}
        if only_stop:
            old_values[self.id].update(self._tl_keep_old_values({start_field: None}))
        old_stop = self._tl_stop(stop_field)
        # the dates of the records handled in this call: (old start, old stop, new start,
        # new stop, whether it moved); a candidate left alone sets no bound (A80)
        handled = {self.id: [self._tl_start(start_field), old_stop]}
        self.write(values)
        handled[self.id] += [self._tl_start(start_field), self._tl_stop(stop_field), True]
        shift = old_stop - self._tl_stop(stop_field)
        names = (dependency_field, inverted_field, start_field, stop_field)
        candidate_ids = {candidate.id for candidate in candidates}

        for candidate in candidates:
            old_start, old_candidate_stop = (
                candidate._tl_start(start_field), candidate._tl_stop(stop_field))
            if method == CONSUME_BUFFER and not candidate._web_gantt_is_candidate_in_conflict(
                    *names):
                handled[candidate.id] = [old_start, old_candidate_stop,
                                         old_start, old_candidate_stop, False]
                continue
            bounds = [
                bound for bound in (
                    candidate._tl_outer_bound(forward, handled, candidate_ids, *names),
                    candidate._tl_spread_bound(forward, handled, keep_buffer, *names),
                ) if bound is not None
            ]
            if forward:
                best = max(bounds) if bounds else old_start
            else:
                if only_stop and shift > timedelta(0):
                    bounds.append(old_candidate_stop - shift)
                best = min(bounds) if bounds else old_candidate_stop
            new_start, new_stop = candidate._web_gantt_reschedule_compute_dates(
                best, forward, start_field, stop_field)
            old_values[candidate.id] = {
                start_field: candidate._tl_text(start_field),
                stop_field: candidate._tl_text(stop_field),
            }
            written = candidate._web_gantt_reschedule_write_new_dates(
                new_start, new_stop, start_field, stop_field)
            if not written:
                return [(PAST_ERROR, candidate)], [], {}
            handled[candidate.id] = [old_start, old_candidate_stop, new_start, new_stop, True]
        return [], [], old_values

    def _tl_outer_bound(self, forward, handled, candidate_ids, dependency_field,
                        inverted_field, start_field, stop_field):
        """Bound from the neighbours that are not part of this call (R19 points 1 and 2):
        the latest stop of the blockers forward, the earliest start of the blocked
        records backward (neighbours with both dates)."""
        self.ensure_one()
        found = []
        for other in self[dependency_field if forward else inverted_field]:
            if other.id in handled or other.id in candidate_ids:
                continue
            if other[start_field] and other[stop_field]:
                found.append(other._tl_stop(stop_field) if forward
                             else other._tl_start(start_field))
        if not found:
            return None
        return max(found) if forward else min(found)

    def _tl_spread_bound(self, forward, handled, keep_buffer, dependency_field,
                         inverted_field, start_field, stop_field):
        """Bound from the neighbours moved before this record in this call: the new stop
        of a blocker (plus the old free time with keep buffer) forward, the new start of a
        blocked record (minus the old free time) backward."""
        self.ensure_one()
        found = []
        for other in self[dependency_field if forward else inverted_field]:
            entry = handled.get(other.id)
            if not entry or not entry[4]:
                continue
            old_start, old_stop, new_start, new_stop, _moved = entry
            if forward:
                bound = new_stop
                start = self._tl_start(start_field)
                if keep_buffer and start > old_stop:
                    bound += start - old_stop
            else:
                bound = new_start
                stop = self._tl_stop(stop_field)
                if keep_buffer and stop < old_start:
                    bound -= old_start - stop
            found.append(bound)
        if not found:
            return None
        return max(found) if forward else min(found)
