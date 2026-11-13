# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import base64
import json
import struct
import zlib
from datetime import datetime, time, timedelta

from odoo import api, fields, models

HOOK_PARAMETER = 'test_web_gantt.hook_answers'


def _tl_solid_png(red, green, blue, size=32):
    """A small solid-colour PNG, made without any imaging library."""
    row = b'\x00' + bytes((red, green, blue)) * size

    def chunk(kind, data):
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(row * size))
        + chunk(b'IEND', b'')
    )


class TimelineHostPill(models.Model):
    _name = 'test.web.gantt.pill'
    _description = 'Test Web Gantt Pill'

    active = fields.Boolean(default=True)
    name = fields.Char()
    dependency_field = fields.Many2many(
        'test.web.gantt.pill', relation='web_gantt_test_pill_dep',
        column1='slave', column2='master', string='De')
    dependency_inverted_field = fields.Many2many(
        'test.web.gantt.pill', relation='web_gantt_test_pill_dep',
        column1='master', column2='slave')
    date_start = fields.Datetime('Start Datetime')
    date_stop = fields.Datetime('Stop Datetime')
    parent_id = fields.Many2one('test.web.gantt.pill', string='Parent')
    pill_properties_definition = fields.PropertiesDefinition('Pill Properties Definition')
    pill_properties = fields.Properties(
        'Pill Properties', definition='parent_id.pill_properties_definition', copy=True)

    @api.model
    def _tl_hook_answers(self, kind, field, res_ids):
        raw = self.env['ir.config_parameter'].sudo().get_str(HOOK_PARAMETER)
        if not raw:
            return None
        per_field = json.loads(raw).get(kind, {}).get(field, {})
        wanted = {str(res_id) for res_id in res_ids}
        return {key: value for key, value in per_field.items() if key in wanted}

    @api.model
    def _gantt_unavailability(self, *hook_args):
        answer = self._tl_hook_answers('unavailability', hook_args[0], hook_args[1])
        return super()._gantt_unavailability(*hook_args) if answer is None else answer

    @api.model
    def _gantt_progress_bar(self, *hook_args):
        answer = self._tl_hook_answers('progress', hook_args[0], hook_args[1])
        return super()._gantt_progress_bar(*hook_args) if answer is None else answer

    @api.model
    def _tl_build_host_records(self, today=None, tz_offset_hours=3):
        """Create the records of the scratch host; times are browser-local."""
        if today is None:
            today = (fields.Datetime.now() + timedelta(hours=tz_offset_hours)).date()
        elif isinstance(today, str):
            today = fields.Date.to_date(today)
        offset = timedelta(hours=tz_offset_hours)

        def at(days, clock):
            hour, minute = (int(part) for part in clock.split(':'))
            local = datetime.combine(today + timedelta(days=days), time(hour, minute))
            return fields.Datetime.to_string(local - offset)

        built = {}
        palette = ((200, 60, 60), (60, 160, 90), (60, 100, 200))
        for index, rgb in enumerate(palette, start=1):
            built[f'C{index}'] = self.env['res.partner'].create({
                'name': f'Host Contact {index}',
                'image_1920': base64.b64encode(_tl_solid_png(*rgb)).decode(),
            })
        for index in (1, 2):
            built[f'T{index}'] = self.env['res.partner.category'].create(
                {'name': f'Host Tag {index}'})
        for name in ('Alpha', 'Beta', 'Gamma'):
            built[name] = self.create({'name': name})
        rows = [
            # name, parent, contact, start, stop, colour, progress, tags, extra
            ('Design', 'Alpha', 'C1', (-3, '09:00'), (-1, '18:00'), 1, 40, ('T1',), {}),
            ('Build', 'Alpha', 'C1', (0, '09:00'), (2, '18:00'), 2, 75, ('T1', 'T2'), {}),
            ('Review', 'Alpha', 'C2', (0, '13:00'), (0, '17:00'), 3, 0, (), {}),
            ('Test', 'Beta', 'C2', (1, '08:00'), (4, '12:00'), 4, 0, (), {'x_flagged': True}),
            ('Deploy', 'Beta', 'C3', (5, '08:00'), (6, '18:00'), 5, 0, (), {'x_done': True}),
            ('Plan', None, None, (-1, '09:00'), (1, '12:00'), 0, 0, (), {}),
            ('Long task', 'Gamma', 'C3', (-20, '09:00'), (20, '18:00'), 6, 0, (), {}),
            ('Overlap A', 'Gamma', 'C3', (-2, '10:00'), (0, '12:00'), 7, 0, (), {}),
            ('Overlap B', 'Gamma', 'C3', (-1, '14:00'), (1, '12:00'), 8, 0, (), {}),
            ('Overlap C', 'Gamma', 'C3', (0, '08:00'), (2, '18:00'), 9, 0, (), {}),
            ('Color ten', 'Gamma', None, (3, '08:00'), (4, '18:00'), 10, 0, (), {}),
            ('Color eleven', 'Gamma', None, (-3, '08:00'), (-2, '18:00'), 11, 0, (), {}),
            ('Wrong order', 'Beta', None, (3, '18:00'), (3, '09:00'), 10, 0, (), {}),
            ('Unscheduled', 'Beta', None, None, None, 0, 0, (), {}),
        ]
        for name, parent, contact, start, stop, color, progress, tags, extra in rows:
            values = {
                'name': name,
                'parent_id': built[parent].id if parent else False,
                'x_contact': built[contact].id if contact else False,
                'date_start': at(*start) if start else False,
                'date_stop': at(*stop) if stop else False,
                'x_color': color,
                'x_progress': progress,
                'x_tags': [(6, 0, [built[tag].id for tag in tags])],
            }
            values.update(extra)
            built[name] = self.create(values)
        # H14 and H15: the first and last displayed days of the week range of today (the week
        # starts on Sunday, as in US English), and the days around them; 10:00 to 12:00 UTC
        first_day = today - timedelta(days=(today.weekday() + 1) % 7 + 7)
        last_day = first_day + timedelta(days=20)
        for name, day in (
            ('MIX first', first_day), ('MIX last', last_day),
            ('MIX before', first_day - timedelta(days=1)),
            ('MIX after', last_day + timedelta(days=1)),
        ):
            built[name] = self.create({
                'name': name,
                'x_day': day,
                'date_start': datetime.combine(day, time(10, 0)),
                'date_stop': datetime.combine(day, time(12, 0)),
            })
        # H26 gives Gamma as the default Parent of the records created from its view
        action = self.env.ref('test_web_gantt.host_action_h26', raise_if_not_found=False)
        if action:
            action.sudo().context = str(
                {'group_by': ['parent_id'], 'default_parent_id': built['Gamma'].id})
        pill2 = self.env['test.web.gantt.pill2']
        for name, first, last in (
            ('Day one', 0, 0), ('Three days', -1, 1), ('Next month', 25, 40),
        ):
            built[name] = pill2.create({
                'name': name,
                'date_start': today + timedelta(days=first),
                'date_stop': today + timedelta(days=last),
            })
        return built


class TimelineHostDatedPill(models.Model):
    _name = 'test.web.gantt.pill2'
    _description = 'Test Web Gantt Pill 2'

    active = fields.Boolean(default=True)
    name = fields.Char()
    dependency_field = fields.Many2many(
        'test.web.gantt.pill2', relation='web_gantt_test_pill_2_dep',
        column1='slave', column2='master', string='De')
    dependency_inverted_field = fields.Many2many(
        'test.web.gantt.pill2', relation='web_gantt_test_pill_2_dep',
        column1='master', column2='slave')
    date_start = fields.Date('Start Date')
    date_stop = fields.Date('Stop Date')
    parent_id = fields.Many2one('test.web.gantt.pill2', string='Parent')
