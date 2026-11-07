# Timer (`timer`)

Record time. Gives any business document a personal stopwatch for each user.

Timer is a technical module. It has no menu, view or settings of its own: an
application such as a helpdesk, a project or a field-service module adds the
timer to its own documents and screens. User documentation:
[docs/modules/timer.md](../../docs/modules/timer.md).

The module name `timer` is the original module name, kept so that existing
databases and modules that depend on it keep working (see
[docs/module-authoring.md](../../docs/module-authoring.md#naming)).

## What it provides

| Part | Technical name | Purpose |
|---|---|---|
| Timer record | `timer.timer` | One user's stopwatch on one document: start moment, pause moment, document model and id, user, optional parent document. At most one per document and user (`_unique_timer`). |
| Timer behaviour | `timer.mixin` | Inherit it on a document model to get `action_timer_start`, `action_timer_pause`, `action_timer_resume`, `action_timer_stop` and the read-only fields `timer_start`, `timer_pause`, `is_timer_running`, `user_timer_id`. |
| Extension hooks | on `timer.mixin` | `_action_interrupt_user_timers` (reaction when another timer starts; default pause), `_get_timer_vals`, `_create_timer`, `_get_user_timers`, `_get_timers_from_other_users`, `_stop_timer_in_progress`. |
| Parent timer behaviour | `timer.parent.mixin` | For a parent document whose time is always recorded on a child document. Override `_create_record_to_start_timer` to return the child. |
| Rounding helper | `odoo.addons.timer.utils.round_time_spent` | `round_time_spent(minutes, minimum, rounding)`: at least `minimum`, rounded up to a multiple of `rounding` (0 = no rounding). |
| Server clock | `timer.timer.get_server_time()` | Current server time in UTC; read-only call. |
| Running-time display | field widget `timer_start_field` | Live `HH:MM:SS` clock on the `timer_start` field. Option `unit_amount_field` names a float field of hours already recorded, added to the elapsed time. |
| Start/stop button | `TimerToggleButton` from `@timer/timer_toggle_button/timer_toggle_button` | One button that starts or stops the current user's timer. Props: `name` (boolean field, usually `is_timer_running`), `record`, `context`. Saves a dirty record first and does nothing if the save fails. |
| Clock service | service `timer`, hook `useTimer()` from `@timer/timer_service` | Gives each component its own clock object (`setTimer`, `updateTimer`, `formatTime`, `resetTimer`, `addFloatTime`, `toSeconds`, `floatValue`, `getInterval`, `getCurrentTime`, `time`). |

## Rules in short

- A user has at most one running timer. Starting or resuming a timer pauses
  the user's other running timer first (a document model may stop it instead
  by overriding `_action_interrupt_user_timers`). The database enforces it
  with a unique index, so two simultaneous starts cannot both succeed: the
  later one fails with "A user can have only one running timer.". When a
  database that already holds two running timers for one user is upgraded,
  the index cannot be built; Odoo logs a warning ("Constraint not added") and
  the upgrade goes on without the rule. Pause the duplicates, then upgrade
  again.
- Starting needs a document that exists and that the user may read:
  otherwise start raises "The record to time no longer exists." or the
  standard access error, and no other timer is paused.
- Pausing an already paused timer keeps the first pause moment.
- Stopping returns the minutes worked as a decimal number (not rounded) and
  deletes the timer. Stop without a started timer returns `False`.
- Users read every timer but create, change or delete only their own.
- Deleting a document removes every timer on it, of every user, once the
  delete right on the document has been checked.
- Searches: `is_timer_running` finds documents with a running timer of any
  user; `user_timer_id` finds documents where the current user has a timer
  (and, negated, every other document).

## Using it in a module

```python
class HelpdeskTicket(models.Model):
    _name = 'helpdesk.ticket'
    _inherit = ['timer.mixin']
```

```xml
<field name="hours_spent" widget="float_time"/>
<field name="timer_start" widget="timer_start_field"
       options="{'unit_amount_field': 'hours_spent'}" string="Timer"/>
<button name="action_timer_start" type="object" string="Start"
        invisible="is_timer_running"/>
```

A JavaScript component can embed the button:

```js
import { TimerToggleButton } from "@timer/timer_toggle_button/timer_toggle_button";
// <TimerToggleButton name="'is_timer_running'" record="props.record" context="{}"/>
```

## Provenance

Written in a clean room from spec package slice `000` (timer). The
provenance record will be `provenance/timer.yaml`. See
[docs/process.md](../../docs/process.md).

## Tests

The tests live in the hidden module [`test_timer`](../test_timer/README.md).

```
make test MODULES=timer,test_timer
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers) instead of `make test`.
