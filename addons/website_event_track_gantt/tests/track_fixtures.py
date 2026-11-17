# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Records the track Gantt scenarios share. Every record is found by name and
created when missing, so the tests pass with and without demo data."""

from datetime import datetime, timedelta


def _location(env, name):
    Location = env['event.track.location']
    return Location.search([('name', '=', name)], limit=1) or Location.create({'name': name})


def use_one_language(env):
    """One active language (N7): a second one adds the ``EN`` button to the title field of the
    record dialog, which the dialog scenarios, probes and screenshots do not show. Users and
    partners of another language are moved to English first, so that the language can go."""
    others = env['res.lang'].search([('active', '=', True), ('code', '!=', 'en_US')])
    if others:
        env['res.users'].with_context(active_test=False).search(
            [('lang', 'in', others.mapped('code'))]).write({'lang': 'en_US'})
        env['res.partner'].with_context(active_test=False).search(
            [('lang', 'in', others.mapped('code'))]).write({'lang': 'en_US'})
        if 'website' in env:
            # a language of a website cannot be deactivated (the demo data adds some)
            english = env['res.lang'].search([('code', '=', 'en_US')])
            env['website'].search([]).write(
                {'language_ids': [(6, 0, english.ids)], 'default_lang_id': english.id})
        others.write({'active': False})
    assert env['res.lang'].search_count([('active', '=', True)]) == 1


def make_gantt_summit(env):
    old = env['event.event'].with_context(active_test=False).search([('name', '=', 'Gantt Summit')])
    old.track_ids.with_context(active_test=False).unlink()
    old.unlink()
    theatre = _location(env, 'Theatre')
    lauzelle = _location(env, 'Lauzelle')
    event = env['event.event'].create({
        'name': 'Gantt Summit',
        'date_begin': datetime(2030, 6, 10, 6, 0),
        'date_end': datetime(2030, 6, 12, 15, 0),
        'date_tz': 'Europe/Istanbul',
    })
    no_location = env['event.track.location']
    rows = [
        ('Opening Keynote', datetime(2030, 6, 10, 7, 0), 1.5, theatre, 1, 'Ada Lumber'),
        ('Wood Joinery', datetime(2030, 6, 10, 9, 0), 3.0, theatre, 2, 'Ben Carver'),
        ('Panel Talk', datetime(2030, 6, 11, 8, 0), 4.0, lauzelle, 4, False),
        ('Closing Words', datetime(2030, 6, 12, 13, 0), 1.0, no_location, 3, 'Ada Lumber'),
        ('Open Workshop', False, 0.5, lauzelle, 5, False),
    ]
    tracks = {}
    for name, start, duration, location, color, speaker in rows:
        tracks[name] = env['event.track'].create({
            'name': name,
            'event_id': event.id,
            'date': start,
            'duration': duration,
            'location_id': location.id,
            'color': color,
            'partner_name': speaker,
        })
    return {'event': event, 'tracks': tracks}


def _user(env, name, login, group_xmlid):
    user = env['res.users'].search([('login', '=', login)], limit=1)
    if user:
        # a user found by login gets the same two groups as a new one
        user.write({'group_ids': [(6, 0, [
            env.ref('base.group_user').id, env.ref(group_xmlid).id])]})
        return user
    return env['res.users'].with_context(no_reset_password=True).create({
        'name': name,
        'login': login,
        'password': login,
        'email': f'{login}@example.com',
        'group_ids': [(6, 0, [env.ref('base.group_user').id, env.ref(group_xmlid).id])],
    })


def make_event_users(env):
    return {
        'organizer': _user(env, 'Event Organizer', 'evuser', 'event.group_event_user'),
        'clerk': _user(env, 'Desk Clerk', 'evdesk', 'event.group_event_registration_desk'),
    }


def make_tz_events(env):
    rows = [
        ('TZ east', datetime(2030, 7, 1, 22, 30)),
        ('TZ west midday', datetime(2030, 7, 1, 18, 0)),
        ('TZ west late', datetime(2030, 7, 2, 5, 30)),
    ]
    events = {}
    for name, start in rows:
        values = {'date_begin': start, 'date_end': start + timedelta(hours=2)}
        event = env['event.event'].search([('name', '=', name)], limit=1)
        if event:
            event.write(values)
        else:
            event = env['event.event'].create({'name': name, **values})
        events[name] = event
    return events
