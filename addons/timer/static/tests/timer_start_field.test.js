// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { defineMailModels } from "@mail/../tests/mail_test_helpers";
import { Component, proxy, t, useProps, xml } from "@odoo/owl";
import { advanceTime, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    defineModels,
    fields,
    models,
    mountView,
    mountWithCleanup,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { deserializeDateTime, serializeDateTime } from "@web/core/l10n/dates";

import { Timer } from "@timer/timer_service";
import { TimerStartField } from "@timer/timer_start_field/timer_start_field";

const { DateTime } = luxon;

describe.current.tags("desktop");

class TimerTest extends models.Model {
    _name = "timer.test";

    name = fields.Char();
    timer_start = fields.Datetime();
    timer_pause = fields.Datetime();
    hours_logged = fields.Float();

    action_pause(ids) {
        this.write(ids, { timer_pause: stamp(0) });
        return true;
    }

    action_resume(ids) {
        const [record] = this.read(ids, ["timer_start", "timer_pause"]);
        const shift = DateTime.now().toMillis() - deserializeDateTime(record.timer_pause).toMillis();
        const start = deserializeDateTime(record.timer_start).plus({ milliseconds: shift });
        this.write(ids, { timer_start: serializeDateTime(start), timer_pause: false });
        return true;
    }
}

defineMailModels();
defineModels([TimerTest]);

/** Server-format UTC string, `seconds` away from the mocked now. */
function stamp(seconds) {
    return serializeDateTime(DateTime.now().plus({ seconds }));
}

const FORM_ARCH = `
    <form>
        <field name="name"/>
        <field name="hours_logged"/>
        <field name="timer_start" widget="timer_start_field" options="{'unit_amount_field': 'hours_logged'}"/>
    </form>`;

const DISPLAY = ".o_field_widget[name=timer_start]";

async function mountForm(resId = 1, extra = {}) {
    return mountView({ type: "form", resModel: "timer.test", resId, arch: FORM_ARCH, ...extra });
}

test("U1: display ticks while running", async () => {
    mockDate("2026-05-01 12:00:00");
    TimerTest._records = [{ id: 1, name: "A", hours_logged: 1.5, timer_start: stamp(0) }];
    await mountForm();
    expect(`${DISPLAY} span`).toHaveText("01:30:00");
    await advanceTime(1000);
    expect(`${DISPLAY} span`).toHaveText("01:30:01");
    await advanceTime(1000);
    expect(`${DISPLAY} span`).toHaveText("01:30:02");
});

test("U1: display ignores the user timezone", async () => {
    mockDate("2026-05-01 12:00:00", +3);
    mockTimeZone("Europe/Istanbul");
    TimerTest._records = [{ id: 1, name: "A", hours_logged: 0, timer_start: stamp(-3600) }];
    await mountForm();
    expect(`${DISPLAY} span`).toHaveText("01:00:00");
    await advanceTime(2000);
    expect(`${DISPLAY} span`).toHaveText("01:00:02");
});

test("U2: display freezes on pause and continues on resume", async () => {
    mockDate("2026-05-01 12:00:00");
    TimerTest._records = [{ id: 1, name: "A", hours_logged: 0, timer_start: stamp(-10) }];
    await mountView({
        type: "form",
        resModel: "timer.test",
        resId: 1,
        arch: `<form>
            <header>
                <button name="action_pause" type="object" string="Pause"/>
                <button name="action_resume" type="object" string="Resume"/>
            </header>
            <field name="hours_logged"/>
            <field name="timer_start" widget="timer_start_field" options="{'unit_amount_field': 'hours_logged'}"/>
        </form>`,
    });
    expect(`${DISPLAY} span`).toHaveText("00:00:10");
    await advanceTime(2000);
    expect(`${DISPLAY} span`).toHaveText("00:00:12");
    await contains("button[name=action_pause]").click();
    expect(`${DISPLAY} span`).toHaveText("00:00:12");
    await advanceTime(5000);
    expect(`${DISPLAY} span`).toHaveText("00:00:12");
    await contains("button[name=action_resume]").click();
    expect(`${DISPLAY} span`).toHaveText("00:00:12");
    await advanceTime(2000);
    expect(`${DISPLAY} span`).toHaveText("00:00:14");
});

test("U3: display empty without a timer", async () => {
    mockDate("2026-05-01 12:00:00");
    TimerTest._records = [{ id: 1, name: "A", hours_logged: 1.5, timer_start: false }];
    await mountForm();
    expect(`${DISPLAY} span`).toHaveCount(0);
    expect(DISPLAY).toHaveText("");
    await advanceTime(3000);
    expect(DISPLAY).toHaveText("");
});

test("U4: paused display after reload shows start to pause", async () => {
    mockDate("2026-05-01 12:00:00");
    TimerTest._records = [
        { id: 1, name: "A", hours_logged: 0, timer_start: stamp(-7200), timer_pause: stamp(-3600) },
    ];
    await mountForm();
    expect(`${DISPLAY} span`).toHaveText("01:00:00");
    await advanceTime(5000);
    expect(`${DISPLAY} span`).toHaveText("01:00:00");
});

test("U5: list rows are independent", async () => {
    mockDate("2026-05-01 12:00:00");
    TimerTest._records = [
        { id: 1, name: "paused", timer_start: stamp(-7200), timer_pause: stamp(-3600) },
        { id: 2, name: "running", hours_logged: 1.5, timer_start: stamp(-1500) },
        { id: 3, name: "idle" },
    ];
    await mountView({
        type: "list",
        resModel: "timer.test",
        arch: `<list>
            <field name="name"/>
            <field name="hours_logged" column_invisible="1"/>
            <field name="timer_start" widget="timer_start_field" options="{'unit_amount_field': 'hours_logged'}"/>
        </list>`,
    });
    const cell = (row) => `.o_data_row:eq(${row}) .o_data_cell[name=timer_start]`;
    expect(cell(0)).toHaveText("01:00:00");
    expect(cell(1)).toHaveText("01:55:00");
    expect(cell(2)).toHaveText("");
    await advanceTime(3000);
    expect(cell(0)).toHaveText("01:00:00");
    expect(cell(1)).toHaveText("01:55:03");
    expect(cell(2)).toHaveText("");
});

test("R19: display restarts when start or pause changes", async () => {
    mockDate("2026-05-01 12:00:00");
    TimerTest._records = [
        { id: 1, name: "A", hours_logged: 0, timer_start: stamp(-60) },
        { id: 2, name: "B", hours_logged: 2, timer_start: stamp(-10) },
        { id: 3, name: "C", hours_logged: 0, timer_start: stamp(-7200), timer_pause: stamp(-3600) },
    ];
    await mountForm(1, { resIds: [1, 2, 3] });
    expect(`${DISPLAY} span`).toHaveText("00:01:00");
    await contains(".o_pager_next").click();
    expect(`${DISPLAY} span`).toHaveText("02:00:10");
    await advanceTime(1000);
    expect(`${DISPLAY} span`).toHaveText("02:00:11");
    // running -> paused in the same widget instance: frozen at start-to-pause
    await contains(".o_pager_next").click();
    expect(`${DISPLAY} span`).toHaveText("01:00:00");
    await advanceTime(3000);
    expect(`${DISPLAY} span`).toHaveText("01:00:00");
    // paused -> running again: continues from the new values
    await contains(".o_pager_previous").click();
    expect(`${DISPLAY} span`).toHaveText("02:00:14");
    await advanceTime(1000);
    expect(`${DISPLAY} span`).toHaveText("02:00:15");
});

class Host extends Component {
    static template = xml`
        <t t-if="this.props.state.show">
            <TimerStartField name="'timer_start'" record="this.props.state.record" unitAmountField="'hours_logged'"/>
        </t>`;
    static components = { TimerStartField };
    props = useProps({ state: t.object() });
}

function makeState(data) {
    return proxy({ show: true, record: { data } });
}

test("R19: start, pause and offset changes restart a mounted display", async () => {
    mockDate("2026-05-01 12:00:00");
    const state = makeState({
        timer_start: DateTime.now(),
        timer_pause: false,
        hours_logged: 1,
    });
    await mountWithCleanup(Host, { props: { state } });
    expect(".o_timer_start_field").toHaveText("01:00:00");
    await advanceTime(2000);
    expect(".o_timer_start_field").toHaveText("01:00:02");
    state.record.data.timer_pause = DateTime.now();
    await animationFrame();
    expect(".o_timer_start_field").toHaveText("01:00:02");
    await advanceTime(5000);
    expect(".o_timer_start_field").toHaveText("01:00:02");
    state.record.data.hours_logged = 2;
    await animationFrame();
    expect(".o_timer_start_field").toHaveText("02:00:02");
    state.record.data.timer_start = DateTime.now().minus({ seconds: 60 });
    state.record.data.timer_pause = false;
    await animationFrame();
    expect(".o_timer_start_field").toHaveText("02:01:00");
    await advanceTime(2000);
    // the exact second depends on the frame the restart happened in
    expect(".o_timer_start_field").toHaveText(/^02:01:0[12]$/);
    state.record.data.timer_start = false;
    await animationFrame();
    expect(".o_timer_start_field").toHaveCount(0);
});

test("R22: interval cleared on unmount", async () => {
    mockDate("2026-05-01 12:00:00");
    let ticks = 0;
    patchWithCleanup(Timer.prototype, {
        updateTimer() {
            ticks++;
            return super.updateTimer(...arguments);
        },
    });
    const state = makeState({
        timer_start: DateTime.now(),
        timer_pause: false,
        hours_logged: 0,
    });
    await mountWithCleanup(Host, { props: { state } });
    await advanceTime(2000);
    expect(ticks).toBe(2);
    state.show = false;
    await animationFrame();
    expect(".o_timer_start_field").toHaveCount(0);
    await advanceTime(5000);
    expect(ticks).toBe(2);
});

test("R22: each display owns its clock", async () => {
    mockDate("2026-05-01 12:00:00");
    const created = [];
    patchWithCleanup(Timer.prototype, {
        setTimer() {
            created.push(this);
            return super.setTimer(...arguments);
        },
    });
    TimerTest._records = [
        { id: 1, name: "A", timer_start: stamp(-60) },
        { id: 2, name: "B", timer_start: stamp(-120) },
    ];
    await mountView({
        type: "list",
        resModel: "timer.test",
        arch: `<list><field name="timer_start" widget="timer_start_field"/></list>`,
    });
    expect(new Set(created).size).toBe(2);
});

test("U1: the offset field is loaded when the view does not declare it", async () => {
    mockDate("2026-05-01 12:00:00");
    TimerTest._records = [{ id: 1, name: "A", hours_logged: 1.5, timer_start: stamp(0) }];
    await mountView({
        type: "form",
        resModel: "timer.test",
        resId: 1,
        arch: `<form>
            <field name="name"/>
            <field name="timer_start" widget="timer_start_field" options="{'unit_amount_field': 'hours_logged'}"/>
        </form>`,
    });
    expect(`${DISPLAY} span`).toHaveText("01:30:00");
});
