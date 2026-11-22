// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    $$,
    assert,
    assertEqual,
    cellOfDate,
    foldedHeaders,
    clean,
    dataSettled,
    dateColumns,
    expectLabel,
    gradientOf,
    isGrey,
    noteMark,
    pickRange,
    pointerAway,
    pressKey,
    realClick,
    realHover,
    rangeName,
    rectOf,
    rowEl,
    rowNames,
    scenario,
    searchFor,
    send,
    settle,
    step,
    until,
    writesSince,
} from "@hr_holidays_gantt/../tests/tours/time_off_tours";

/**
 * Tours of what Time Off changes in the attendance Gantt views (A35, A36, A40) and of the two
 * notes on 002d3 (A79, A80). They run in a database that has the Attendances bridge only; the
 * file reads the page by selectors and imports nothing of the attendance modules, so that it
 * loads in a database without them (a tour that is never run is only registered). The records
 * come from `tests/test_attendance_tours.py`.
 */

const tours = registry.category("web_tour.tours");

const WEEK_DAYS = [
    "2026-11-15",
    "2026-11-16",
    "2026-11-17",
    "2026-11-18",
    "2026-11-19",
    "2026-11-20",
    "2026-11-21",
];

// the demo's fixed schedules fold the weekend of the Week range: five day columns
const WORKING_DAYS = WEEK_DAYS.slice(1, 6);

async function weekOfTheFifteenth(days = WEEK_DAYS) {
    await pickRange("week");
    await step(1);
    if (days) {
        assertEqual(
            dateColumns().map((el) => el.dataset.date),
            days,
            "the days of the week of 15 to 21 November"
        );
    }
}

/**
 * The parts of a cell of the Week range as booleans (true: greyed). A whole greyed cell has the
 * class; a partly greyed one has a gradient of two stops per boundary: part 0 is the first stop,
 * part i the stop 2i - 1 (see `partialCellStyle` of the timeline renderer).
 */
function partsOf(cell) {
    if (isGrey(cell)) {
        return "all";
    }
    const stops = gradientOf(cell).match(/(?:var\([^)]*\)|transparent) [\d.]+%/g) || [];
    if (!stops.length) {
        return "none";
    }
    const count = stops.length / 2 + 1;
    const parts = [];
    for (let part = 0; part < count; part++) {
        parts.push(stops[part === 0 ? 0 : 2 * part - 1].includes("unavailable"));
    }
    return parts;
}

const describe = (name, date) => {
    const cell = cellOfDate(name, date);
    return `${name} ${date}: class "${cell.className}", style "${cell.getAttribute("style")}"`;
};

// A35 and A36: flexible leaves in the attendance view -----------------------------------------------

async function flexibleWeek() {
    await weekOfTheFifteenth(null);
    await searchFor("Toff");
    await until(
        () => JSON.stringify(rowNames()) === JSON.stringify(["Toff Fixed", "Toff Flexible"]),
        `the two rows: ${rowNames()}`,
        8000
    );
    await dataSettled();
    await settle(500);
}

/** Monday is greyed whole for both rows yet stays open (screen S11): seven day columns. */
function assertWeekOpen() {
    assertEqual(foldedHeaders().length, 0, "no folded column");
    assertEqual(
        dateColumns().map((el) => el.dataset.date),
        WEEK_DAYS,
        "the seven days are open"
    );
}

scenario("hhg_a35_attendance_flexible", async () => {
    await flexibleWeek();
    assertWeekOpen();
    // Monday is greyed whole, Tuesday's two morning quarters and not its afternoon, Wednesday's
    // 9:00 to 13:00 covers no whole quarter
    assertEqual(partsOf(cellOfDate("Toff Flexible", "2026-11-16")), "all", describe("Toff Flexible", "2026-11-16"));
    const tuesday = partsOf(cellOfDate("Toff Flexible", "2026-11-17"));
    assertEqual(tuesday, [true, true, false, false], describe("Toff Flexible", "2026-11-17"));
    const wednesday = partsOf(cellOfDate("Toff Flexible", "2026-11-18"));
    assert(
        wednesday === "none" || (Array.isArray(wednesday) && !wednesday.some(Boolean)),
        `Wednesday shows nothing greyed: ${describe("Toff Flexible", "2026-11-18")}`
    );
    await expectLabel("Toff Flexible", "0h / 40h", "flexible");
    await expectLabel("Toff Fixed", "0h / 24h", "fixed");
});

scenario("hhg_a36_attendance_expected", async () => {
    await flexibleWeek();
    for (const [name, text] of [
        ["Toff Fixed", "0h/24h (0%)"],
        ["Toff Flexible", "0h/40h (0%)"],
    ]) {
        const bar = $(".o_tl_progress", rowEl(name));
        assert(bar, `${name} has a bar`);
        await realHover(bar);
        const tip = await until(() => $(".o-tooltip"), `the tooltip of ${name}'s bar`);
        await settle();
        assertEqual(clean(tip.textContent), text, `${name}'s tooltip on the bar`);
        await pointerAway();
    }
});

// A40: leaves in the attendance view (the demo's employees) ------------------------------------------

scenario("hhg_a40_attendance_leaves", async () => {
    await weekOfTheFifteenth(WORKING_DAYS);
    await until(
        () => rowNames().includes("Mitchell Admin") && rowNames().includes("Abigail Peterson"),
        `Mitchell Admin and Abigail Peterson have rows: ${rowNames()}`,
        8000
    );
    await dataSettled();
    await settle(500);
    assert(
        isGrey(cellOfDate("Mitchell Admin", "2026-11-16")),
        `Mitchell Admin's Monday is greyed: ${describe("Mitchell Admin", "2026-11-16")}`
    );
    assert(
        !isGrey(cellOfDate("Abigail Peterson", "2026-11-16")),
        `Abigail Peterson's Monday is not greyed: ${describe("Abigail Peterson", "2026-11-16")}`
    );
    await expectLabel("Mitchell Admin", "0h / 16h", "Mitchell Admin");
    await expectLabel("Anita Oliver", "0h / 32h", "Anita Oliver");
});

// A79: the first Escape after typing -----------------------------------------------------------------

const BREAK = ".modal [name='break_duration'] input";

scenario("hhg_a79_first_escape", async () => {
    await until(() => rowEl("Abigail Peterson"), "Abigail Peterson's row", 8000);
    assertEqual(rangeName(), "Day", "the Day range");
    assertEqual(dateColumns()[0].dataset.date.slice(0, 10), "2026-11-11", "of 11 November");
    const mark = noteMark();
    // pressed and released at 3 pm: 986 px right of the centre of the row header
    const header = rectOf($(".o_tl_row_header", rowEl("Abigail Peterson")));
    await realClick(null, {
        at: { x: header.left + header.width / 2 + 986, y: header.top + header.height / 2 },
    });
    await until(() => $(".modal .o_form_view"), "the creation dialog", 12000);
    await settle(700);
    // the break field is clicked, "0:30" typed, Escape pressed
    await realClick(await until(() => $(BREAK), "the break field"));
    await send({ method: "Input.insertText", events: [{ text: "0:30" }] });
    await settle(300);
    assertEqual($(BREAK).value, "0:30", "the break field holds what was typed");
    await pressKey("Escape");
    await settle(2500);
    assertEqual($$(".modal").length, 1, "one dialog is open after the first Escape");
    assertEqual($(BREAK)?.value, "0:30", "the break field still holds 0:30");
    assertEqual(
        $$(".modal input").filter((el) => el === document.activeElement).length,
        1,
        "one input of the dialog holds the focus"
    );
    assert(document.activeElement === $(BREAK), "and it is the break field");
    await pressKey("Escape");
    await until(() => !$(".modal"), "the second Escape closes the dialog");
    await dataSettled();
    assertEqual($$(".modal").length, 0, "no dialog is open after the second Escape");
    assertEqual(writesSince(mark), [], "nothing was saved");
});

// A80: the helper over the period line on the phone ---------------------------------------------------

const searchButton = () =>
    $$(".o_control_panel button").find((button) => $("i[data-icon='search']", button));

tours.add("hhg_a80_helper_phone", {
    steps: () => [
        {
            trigger: ".o_tl_renderer .o_tl_row_header",
            timeout: 60000,
            async run() {
                await settle(800);
                await realClick(searchButton());
                await until(() => $(".o_searchview_input"), "the search bar opens");
                await searchFor("zzzz");
                const helper = await until(() => $(".o_hag_helper"), "the helper of the empty view");
                assertEqual(rowNames(), [""], "one empty row");
                await settle(900);
                const box = rectOf(helper);
                const period = rectOf($(".o_tl_col_group"));
                const row = rectOf($(".o_tl_row"));
                const seen = `helper ${box.top}, period line ${period.top} (${period.height} tall), row ${row.top}`;
                // the table's values, on a page without touch emulation: the helper's top 274.6,
                // the period line from 274 (25 tall) and the empty row from 324
                assert(Math.abs(box.top - 274.6) <= 0.5, `the helper's top is 274.6: ${seen}`);
                assert(Math.abs(period.height - 25) <= 0.5, `the period line is 25 tall: ${seen}`);
                assert(Math.abs(period.top - 274) <= 0.5, `the period line's top is 274: ${seen}`);
                assert(Math.abs(row.top - 324) <= 0.5, `the empty row's top is 324: ${seen}`);
                // M73: 24 hour columns of 40 px, none folded; the period line's title box is as
                // wide as the grid's visible part (260 px): the line's part right of the header
                const columns = $$(".o_tl_col[data-index]");
                assert(columns.length === 24 && foldedHeaders().length === 0, `24 columns, none folded: ${seen}`);
                assert(
                    columns.every((column) => Math.abs(rectOf(column).width - 40) <= 0.5),
                    `every column is 40 px wide: ${columns.map((c) => rectOf(c).width)}`
                );
                const head = rectOf($(".o_tl_title_cell"));
                const visibleWidth = Math.min(period.right, window.innerWidth) - Math.max(period.left, head.right);
                assert(Math.abs(visibleWidth - 260) <= 0.5, `the title box shows 260 px: ${visibleWidth}, ${seen}`);
                // nothing of the grid shows above the helper's top but the period line's top
                // part (none here: it starts under the helper's top), read by points
                const x = window.innerWidth / 2;
                const under = (y) => document.elementFromPoint(x, y);
                const what = (y) => `${under(y)?.tagName}.${under(y)?.className} at (${x}, ${y})`;
                const inHelper = (el) => Boolean(el?.closest(".o_hag_helper"));
                assert(inHelper(under(period.top + 12)), `the period line is covered: ${seen}, ${what(period.top + 12)}`);
                assert(inHelper(under(row.top + 10)), `the empty row is covered: ${seen}, ${what(row.top + 10)}`);
            },
        },
    ],
});

// A91: greyed but not folded (R15, E11) ---------------------------------------------------------------

scenario("hhg_a91_greyed_not_folded", async () => {
    await flexibleWeek();
    assertWeekOpen();
    const widthOf = (date) => rectOf($(`.o_tl_col[data-date="${date}"]`)).width;
    for (const name of ["Toff Flexible", "Toff Fixed"]) {
        // Monday (a whole-day leave) and Thursday (the company's day, ending at 23:59:59)
        for (const date of ["2026-11-16", "2026-11-19"]) {
            assert(isGrey(cellOfDate(name, date)), `${describe(name, date)} is greyed`);
        }
    }
    for (const date of ["2026-11-16", "2026-11-19"]) {
        assertEqual(foldedHeaders().length, 0, `${date}: no folded column`);
        assert(
            Math.abs(widthOf(date) - widthOf("2026-11-17")) < 1,
            `${date} keeps the width of an open day: ${widthOf(date)} against ${widthOf("2026-11-17")}`
        );
    }
});
