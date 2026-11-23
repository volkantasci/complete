// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    $$,
    assert,
    assertEqual,
    cellOfDate,
    cellsOf,
    dataSettled,
    dateColumns,
    expectLabel,
    foldedHeaders,
    gradientOf,
    isGrey,
    pickRange,
    pillsOf,
    pillTitles,
    realClick,
    rectOf,
    removeFacet,
    rowNames,
    scenario,
    searchFor,
    settle,
    step,
    until,
} from "@hr_holidays_gantt/../tests/tours/time_off_tours";

/**
 * Tours of the prepared states (*flexible*, *states*) in the time-off leave view: A31, A37 and
 * A39. The records come from `tests/test_prepared_tours.py`; the clock is Wednesday 11 November
 * 2026, so the Week range after one step reads Sunday 15 to Saturday 21 November.
 */

const tours = registry.category("web_tour.tours");

/** The day of the date column under the middle of a pill. */
function dayOfPill(pill) {
    const box = rectOf(pill);
    const x = box.left + box.width / 2;
    return dateColumns().find((el) => {
        const rect = rectOf(el);
        return rect.left <= x && rect.right >= x;
    })?.dataset.date;
}

/** A cell is greyed whole (the class) or in a part (a gradient with the unavailable colour). */
const greyed = (cell) => isGrey(cell) || gradientOf(cell).includes("unavailable");

const WEEK_DAYS = [
    "2026-11-15",
    "2026-11-16",
    "2026-11-17",
    "2026-11-18",
    "2026-11-19",
    "2026-11-20",
    "2026-11-21",
];

/** The pill titles of a row, left to right. */
const titlesLeftToRight = (name) =>
    pillsOf(name)
        .sort((a, b) => rectOf(a).left - rectOf(b).left)
        .map((pill) => pillTitles(name)[pillsOf(name).indexOf(pill)]);

// a fixed schedule's weekend folds in the Week range (one folded column each side)
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

// A31: flexible schedules in the leave view ---------------------------------------------------------

scenario("hhg_a31_flexible_leave_view", async () => {
    await weekOfTheFifteenth();
    await searchFor("Toff");
    await until(
        () => JSON.stringify(rowNames()) === JSON.stringify(["Toff Fixed", "Toff Flexible"]),
        `the two rows: ${rowNames()}`,
        8000
    );
    await dataSettled();
    await settle(500);
    // the labels: 8 + 4 + 4 hours of the flexible employee, 40 less 16 for the fixed one
    await expectLabel("Toff Flexible", "16h", "flexible");
    await expectLabel("Toff Fixed", "24h", "fixed");
    // the pills
    const expected = ["STO 1d", "STO 0.5d", "TH 04:00"];
    assertEqual(titlesLeftToRight("Toff Flexible"), expected, "Toff Flexible's pills");
    assertEqual(titlesLeftToRight("Toff Fixed"), expected, "Toff Fixed's pills");
    // the greying, on the cells of the named days
    const grey = (name, date) => greyed(cellOfDate(name, date));
    const describe = (name, date) => {
        const cell = cellOfDate(name, date);
        const all = [...cellsOf("Toff Fixed"), ...cellsOf(name)].map(
            (el) => `${el.dataset.column}:${el.className.replace("o_tl_cell", "").trim()}|${el.getAttribute("style")}`
        );
        return `${name} ${date}: class "${cell.className}", style "${cell.getAttribute("style")}" of ${all.join(" ; ")}`;
    };
    assert(grey("Toff Flexible", "2026-11-16"), `Monday is greyed: ${describe("Toff Flexible", "2026-11-16")}`);
    for (const date of ["2026-11-17", "2026-11-18", "2026-11-15"]) {
        assert(!grey("Toff Flexible", date), `not greyed: ${describe("Toff Flexible", date)}`);
    }
    assert(!grey("Toff Fixed", "2026-11-17"), `not greyed: ${describe("Toff Fixed", "2026-11-17")}`);
    // only Monday of the flexible employee's week is greyed
    assertEqual(
        WEEK_DAYS.filter((date) => grey("Toff Flexible", date)),
        ["2026-11-16"],
        "the flexible employee's greyed days"
    );
    // the weekend does not fold
    assertEqual(foldedHeaders().length, 0, "no folded column");
    assertEqual(dateColumns().length, 7, "the seven days are drawn");
});

// A37 and A39: the states of a request ---------------------------------------------------------------

/** Management > Time Off, on its Gantt view (the list opens first). */
async function openManagementGantt() {
    await until(() => $(".o_list_view"), "the list of Management > Time Off", 60000);
    await settle(500);
    await realClick($(".o_cp_switch_buttons .o_switch_view.o_gantt"));
    await until(() => $(".o_tl_renderer .o_tl_row_header"), "the leave view", 20000);
    await dataSettled();
    await settle(500);
}

const markOf = (pill) =>
    ["info", "danger", "warning", "success", "secondary"].filter((name) =>
        $(`.o_tl_pill_mark.o_tl_mark_${name}`, pill)
    );

tours.add("hhg_a37_states", {
    steps: () => [
        {
            trigger: ".o_list_view",
            timeout: 60000,
            async run() {
                await openManagementGantt();
                await removeFacet("Waiting For Me");
                await searchFor("Toff States");
                await until(
                    () => JSON.stringify(rowNames()) === JSON.stringify(["Toff States"]),
                    `one row, Toff States: ${rowNames()}`,
                    8000
                );
                await weekOfTheFifteenth(WORKING_DAYS);
                await dataSettled();
                await settle(500);
                const pills = pillsOf("Toff States").sort((a, b) => rectOf(a).left - rectOf(b).left);
                assertEqual(
                    pills.map(dayOfPill),
                    ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"],
                    "four pills, one per state"
                );
                const [waiting, second, approved, refused] = pills;
                // stripes and the info mark: To Approve and Second Approval
                for (const [pill, what] of [
                    [waiting, "16 November (To Approve)"],
                    [second, "17 November (Second Approval)"],
                ]) {
                    assert(pill.classList.contains("o_tl_striped"), `${what} is striped`);
                    assertEqual(markOf(pill), ["info"], `${what} carries the info mark`);
                }
                // an approved request is plain
                assert(!approved.classList.contains("o_tl_striped"), "18 November is not striped");
                assertEqual(markOf(approved), [], "18 November carries no mark");
                // a refused one carries the danger mark
                assertEqual(markOf(refused), ["danger"], "19 November carries the danger mark");
                assert(!refused.classList.contains("o_tl_striped"), "19 November is not striped");
                // only the approved day is greyed
                const greyedDays = dateColumns()
                    .map((el) => el.dataset.date)
                    .filter((date) => isGrey(cellOfDate("Toff States", date)));
                assertEqual(greyedDays, ["2026-11-18"], "only 18 November is greyed");
                await expectLabel("Toff States", "32h", "Toff States");
            },
        },
    ],
});

scenario("hhg_a39_overview_hides_refused", async () => {
    await weekOfTheFifteenth(null);
    await searchFor("Toff States");
    await until(
        () => JSON.stringify(rowNames()) === JSON.stringify(["Toff States"]),
        `one row, Toff States: ${rowNames()}`,
        8000
    );
    await dataSettled();
    await settle(500);
    assertEqual(
        dateColumns().map((el) => el.dataset.date),
        WORKING_DAYS,
        "the working days of the week, the weekend folded"
    );
    const pills = pillsOf("Toff States").sort((a, b) => rectOf(a).left - rectOf(b).left);
    assertEqual(
        pills.map(dayOfPill),
        ["2026-11-16", "2026-11-17", "2026-11-18"],
        "three pills, none on 19 November"
    );
    assertEqual($$(".o_tl_pill").length, 3, "three pills in all");
});
