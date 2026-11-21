// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import {
    click,
    dblclick,
    drag,
    hover,
    keyDown,
    keyUp,
    press,
    queryAll,
    queryOne,
    queryRect,
    resize,
} from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";

import { LEAVE_ARCH, mountTimeOff, REPORT_ARCH, setupTimeOffFixtures } from "./time_off_test_helpers";

describe.current.tags("desktop");

setupTimeOffFixtures();

const WRITES = ["web_save", "write", "create", "copy", "unlink"];
const LEAVE = ["Anita Oliver", [12, "9:00"], [14, "18:00"]];
const PLAIN_ARCH = (attrs = "") =>
    `<gantt string="Days" date_start="start" date_stop="stop" default_group_by="employee_id"
        default_range="month" scales="week,month,quarter"
        precision="{'week': 'day:full', 'month': 'day:full'}" plan="0" ${attrs}/>`;
const MULTI = `multi_create_view="hhg.form"`;

/** The ORM calls that write, in order. */
let writes;

beforeEach(async () => {
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:05Z");
    patchWithCleanup(localization, { weekStart: 7 });
    writes = [];
    for (const method of WRITES) {
        onRpc(method, ({ method: name }) => {
            writes.push(name);
        });
    }
    await resize({ width: 1600, height: 900 });
});

/** The variants under test: the two time-off variants, with writes allowed in the arch. */
const VARIANTS = {
    leave: () => mountTimeOff({ employees: ["Anita Oliver"], records: [LEAVE] }),
    "leave with a multi_create_view": () =>
        mountTimeOff({
            employees: ["Anita Oliver"],
            records: [LEAVE],
            arch: LEAVE_ARCH(MULTI),
        }),
    report: () =>
        mountTimeOff({
            employees: ["Anita Oliver"],
            records: [LEAVE],
            report: true,
            arch: REPORT_ARCH(),
        }),
};

const pillEl = () => queryOne(".o_tl_row:not(.o_tl_total_row) .o_tl_pill");
const cellOf = (date) => {
    const index = Number(queryOne(`.o_tl_col[data-date="${date}"]`).dataset.index);
    return queryAll(".o_tl_row:not(.o_tl_total_row) .o_tl_cell")[index];
};
/** A point 10 px inside the left edge of the cell of `date`, at mid height. */
function cellPoint(date) {
    const rect = queryRect(cellOf(date));
    return { x: rect.left + 10, y: rect.top + rect.height / 2 };
}
const pillRect = () => queryRect(pillEl());
const leftOf = () => Math.round(pillRect().left);

/** Nothing opened, nothing selected, no handle, nothing written. */
function expectNothing() {
    expect(".o_tl_popover").toHaveCount(0);
    expect(".o_popover").toHaveCount(0);
    expect(".modal").toHaveCount(0);
    expect(".o_tl_cell_picked").toHaveCount(0);
    expect(".o_tl_selected").toHaveCount(0);
    expect(".o_tl_handle").toHaveCount(0);
    expect(writes).toEqual([]);
}

async function settle() {
    await advanceTime(300);
    await animationFrame();
}

for (const [name, mount] of Object.entries(VARIANTS)) {
    describe(name, () => {
        test("A64: click and double click on a pill do nothing", async () => {
            await mount();
            const before = leftOf();
            await click(pillEl());
            await settle();
            expectNothing();
            await dblclick(pillEl());
            await settle();
            expectNothing();
            expect(leftOf()).toBe(before);
        });

        test("A65: the pointer over a pill shows nothing", async () => {
            await mount();
            await hover(pillEl());
            await settle();
            expectNothing();
        });

        test("A66: a press and a drag of 120 px does not move the pill, writes nothing", async () => {
            await mount();
            const before = leftOf();
            const rect = pillRect();
            const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            const helpers = await drag(pillEl(), { position: start });
            await helpers.moveTo(document.elementFromPoint(start.x + 120, start.y), {
                position: { x: start.x + 120, y: start.y },
            });
            await animationFrame();
            expect(".o_tl_pill_moved").toHaveCount(0);
            await helpers.drop();
            await settle();
            expectNothing();
            expect(leftOf()).toBe(before);
        });

        test("A67: a drag from 4 px inside the right end does not resize", async () => {
            await mount();
            const before = Math.round(pillRect().right);
            const rect = pillRect();
            const start = { x: rect.right - 4, y: rect.top + rect.height / 2 };
            const helpers = await drag(pillEl(), { position: start });
            await helpers.moveTo(document.elementFromPoint(start.x + 120, start.y), {
                position: { x: start.x + 120, y: start.y },
            });
            await helpers.drop();
            await settle();
            expectNothing();
            expect(Math.round(pillRect().right)).toBe(before);
        });

        test("A68: a Ctrl-drag does not copy", async () => {
            await mount();
            const before = leftOf();
            const rect = pillRect();
            const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            await keyDown("ctrl");
            const helpers = await drag(pillEl(), { position: start });
            await helpers.moveTo(document.elementFromPoint(start.x + 120, start.y), {
                position: { x: start.x + 120, y: start.y },
            });
            await helpers.drop();
            await keyUp("ctrl");
            await settle();
            expectNothing();
            expect(queryAll(".o_tl_row:not(.o_tl_total_row) .o_tl_pill")).toHaveCount(1);
            expect(leftOf()).toBe(before);
        });

        test("A69: a click and a double click on an empty cell do nothing", async () => {
            await mount();
            const point = cellPoint("2026-11-20");
            await click(cellOf("2026-11-20"), { position: point });
            await settle();
            expectNothing();
            await dblclick(cellOf("2026-11-20"), { position: point });
            await settle();
            expectNothing();
        });

        test("A70: a drag across the cells of 12 to 13 November selects nothing", async () => {
            await mount();
            const from = cellPoint("2026-11-23");
            const to = cellPoint("2026-11-24");
            const helpers = await drag(cellOf("2026-11-23"), { position: from });
            await helpers.moveTo(cellOf("2026-11-24"), { position: { x: to.x + 12, y: to.y } });
            await animationFrame();
            expect(".o_tl_drawing").toHaveCount(0);
            await helpers.drop();
            await settle();
            expectNothing();
        });

        test("A71: Ctrl-click on cells selects nothing", async () => {
            await mount();
            await keyDown("ctrl");
            await click(cellOf("2026-11-20"), { position: cellPoint("2026-11-20") });
            await click(cellOf("2026-11-21"), { position: cellPoint("2026-11-21") });
            await keyUp("ctrl");
            await settle();
            expectNothing();
        });

        test("A72: a click on a column header or a row header selects nothing", async () => {
            await mount();
            await click(".o_tl_col[data-date='2026-11-20']");
            await settle();
            expectNothing();
            await click(".o_tl_row_header");
            await settle();
            expectNothing();
        });

        test("A73: Escape, Enter and Delete with nothing open do nothing", async () => {
            await mount();
            await hover(pillEl());
            for (const key of ["Escape", "Enter", "Delete"]) {
                await press(key);
                await settle();
            }
            await click(pillEl());
            await press("Delete");
            await settle();
            expectNothing();
            expect(queryAll(".o_tl_row:not(.o_tl_total_row) .o_tl_pill")).toHaveCount(1);
        });
    });
}

describe("what stays", () => {
    test("a click on a row header scrolls and selects nothing; folding still works", async () => {
        await mountTimeOff({ employees: ["Anita Oliver"], records: [LEAVE] });
        await click(".o_tl_row_header");
        await settle();
        expect(".o_tl_cell_picked").toHaveCount(0);
        expect(".o_tl_pill").toHaveCount(1);
        // folding a run by its header (002a R29) is not a selection input
        const foldable = queryAll(".o_tl_col.o_tl_foldable");
        if (foldable.length) {
            await click(foldable[0]);
            await settle();
            expect(".o_tl_col.o_tl_folded").toHaveCount(1);
            expect(".o_tl_cell_picked").toHaveCount(0);
            await click(".o_tl_col.o_tl_folded");
            await settle();
            expect(".o_tl_col.o_tl_folded").toHaveCount(0);
        }
    });
});

describe("control: a plain Gantt view of the same data keeps every input", () => {
    const mountPlain = (attrs = "") =>
        mountTimeOff({
            employees: ["Anita Oliver"],
            records: [LEAVE],
            arch: PLAIN_ARCH(attrs),
        });

    test("click opens the popover, double click opens the dialog", async () => {
        await mountPlain();
        await click(pillEl());
        await advanceTime(300);
        await animationFrame();
        expect(".o_tl_popover").toHaveCount(1);
        await dblclick(pillEl());
        await advanceTime(300);
        await animationFrame();
        expect(".modal").toHaveCount(1);
    });

    test("hover shows the handles", async () => {
        await mountPlain();
        await hover(pillEl());
        await animationFrame();
        expect(".o_tl_handle").toHaveCount(2);
    });

    test("a drag moves the pill and writes", async () => {
        await mountPlain();
        const before = leftOf();
        const rect = pillRect();
        const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const helpers = await drag(pillEl(), { position: start });
        await helpers.moveTo(document.elementFromPoint(start.x + 120, start.y), {
            position: { x: start.x + 120, y: start.y },
        });
        await helpers.drop();
        await settle();
        expect(writes).toInclude("write");
        expect(leftOf()).not.toBe(before);
    });

    test("a click on an empty cell opens the creation dialog", async () => {
        await mountPlain();
        await click(cellOf("2026-11-20"), { position: cellPoint("2026-11-20") });
        await settle();
        expect(".modal").toHaveCount(1);
    });

    test("with a multi_create_view, a click on a cell selects it", async () => {
        await mountPlain(MULTI);
        await click(cellOf("2026-11-20"), { position: cellPoint("2026-11-20") });
        await settle();
        expect(".o_tl_cell_picked").not.toHaveCount(0);
    });
});
