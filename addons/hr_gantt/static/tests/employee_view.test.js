// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { start } from "@mail/../tests/mail_test_helpers";
import { beforeEach, describe, expect, hover, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { click, queryAll, queryOne, queryRect, resize, waitFor } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import { contains, mountView, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { timelineMock } from "@web_gantt/../tests/timeline_test_helpers";
import { EmployeeTimelineRenderer } from "../src/employee_timeline_renderer";

import {
    ARCH,
    HALF_HOUR_PRECISION,
    makeEmployeeData,
    setupEmployeeFixtures,
    utc,
} from "./employee_test_helpers";

describe.current.tags("desktop");

setupEmployeeFixtures();

beforeEach(() => {
    mockTimeZone(1);
    mockDate("2026-11-11 10:00:00");
    patchWithCleanup(localization, { weekStart: 7 });
});

/** How many avatar cards are open. */
function openCardCount() {
    return document.querySelectorAll(".o_avatar_card").length;
}

const SHIFTS = [
    ["Day shift", "Anita Oliver", [11, "9:00"], [11, "12:00"]],
    ["Other shift", "Jennie Fletcher", [11, "9:00"], [11, "12:00"]],
    ["Nobody shift", false, [11, "9:00"], [11, "12:00"]],
];

async function mountEmployees({ attrs = `default_range="day"`, groupBy = ["employee_id"], ...rest } = {}) {
    const ids = await makeEmployeeData(["Anita Oliver", "Jennie Fletcher"], SHIFTS);
    await start();
    await mountView({ type: "gantt", resModel: "hrg.shift", arch: ARCH(attrs), groupBy, ...rest });
    await animationFrame();
    return ids;
}

const avatars = () => queryAll(".o_hrg_avatar");
const headerOf = (name) =>
    queryAll(".o_tl_row_header").find((header) => header.textContent.includes(name));
const avatarOf = (name) => headerOf(name).querySelector(".o_hrg_avatar");

// ----------------------------------------------------------------------------
// R3
// ----------------------------------------------------------------------------

test("R3: user_domain holds the filters of the search, not the action domain, grouping or period", async () => {
    await mountEmployees({
        domain: [["id", "in", [1, 2, 3]]],
        searchViewArch: `<search>
            <filter name="with_a" string="Name has an a" domain="[['name', 'ilike', 'a']]"/>
        </search>`,
        context: { search_default_with_a: 1 },
    });
    const call = timelineMock.calls.at(-1);
    expect(call.context.user_domain).toEqual([["name", "ilike", "a"]]);
    // the call's own domain holds the action's and the period's conditions
    expect(JSON.stringify(call.domain)).toInclude('"id"');
    expect(JSON.stringify(call.context.user_domain)).not.toInclude('"id"');
    expect(JSON.stringify(call.context.user_domain)).not.toInclude('"start"');
    expect(call.groupby).toEqual(["employee_id"]);
});

// ----------------------------------------------------------------------------
// R4
// ----------------------------------------------------------------------------

test("R4: avatar and name of an employee row", async () => {
    const ids = await mountEmployees();
    expect(avatars()).toHaveCount(2);
    const avatar = avatarOf("Anita Oliver");
    const rect = queryRect(avatar);
    expect([rect.width, rect.height]).toEqual([24, 24]);
    const style = getComputedStyle(avatar);
    expect(style.borderTopLeftRadius).toBe("6px");
    expect(style.borderBottomRightRadius).toBe("6px");
    expect(style.marginRight).toBe("8px");
    // the image of the public record, which every internal user may read (the test page swaps
    // the file for a placeholder, so the address is read from the renderer)
    expect(EmployeeTimelineRenderer.prototype.avatarUrl({ id: ids["Anita Oliver"] })).toInclude(
        `/web/image/hr.employee.public/${ids["Anita Oliver"]}/avatar_128`
    );
    const name = headerOf("Anita Oliver").querySelector(".o_tl_row_label");
    const label = getComputedStyle(name);
    expect(label.fontSize).toBe("14px");
    expect(label.fontWeight).toBe("400");
    expect(label.textOverflow).toBe("ellipsis");
    expect(label.overflow).toBe("hidden");
    // the name follows the avatar
    expect(queryRect(name).left).not.toBeLessThan(rect.right);
    // the row without an employee has no avatar
    const empty = queryAll(".o_tl_row_header").filter((header) => !header.querySelector(".o_hrg_avatar"));
    expect(empty).toHaveCount(1);
});

test("A8: an employee group row at the first level shows the avatar too", async () => {
    await mountEmployees({ groupBy: ["employee_id", "department_id"] });
    const groups = queryAll(".o_tl_group_row .o_tl_row_header");
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.filter((header) => header.querySelector(".o_hrg_avatar")).length).toBe(
        groups.filter((header) => /Anita|Jennie/.test(header.textContent)).length
    );
    expect(avatars().length).toBeGreaterThan(0);
});

test("A9: rows of another field keep 002a's look", async () => {
    await mountEmployees({ groupBy: ["department_id"] });
    expect(avatars()).toHaveCount(0);
    expect(".o_tl_row_header").toHaveCount(1);
});

// ----------------------------------------------------------------------------
// R5
// ----------------------------------------------------------------------------

test("A10: the card opens under the avatar, a second click keeps it, Escape and outside close it", async () => {
    await mountEmployees();
    const avatar = avatarOf("Anita Oliver");
    await contains(avatar).click();
    await waitFor(".o-mail-avatar-card-name:text(Anita Oliver)");
    expect(queryRect(".o_avatar_card").top).not.toBeLessThan(queryRect(avatar).bottom - 1);
    await contains(avatar).click();
    expect(".o_avatar_card").toHaveCount(1);
    await contains(document.body).press("Escape");
    await animationFrame();
    expect(openCardCount()).toBe(0);
    await contains(avatar).click();
    await waitFor(".o_avatar_card");
    await contains(".o_tl_title_cell").click();
    await animationFrame();
    expect(openCardCount()).toBe(0);
});

test("A11: a click on the avatar does not reach the row header, a click on the name does", async () => {
    let headerClicks = 0;
    patchWithCleanup(EmployeeTimelineRenderer.prototype, {
        onRowHeaderClick() {
            headerClicks++;
            return super.onRowHeaderClick(...arguments);
        },
    });
    await mountEmployees();
    await contains(avatarOf("Anita Oliver")).click();
    await waitFor(".o_avatar_card");
    expect(headerClicks).toBe(0);
    await contains(".o_avatar_card").press("Escape");
    await contains(headerOf("Anita Oliver").querySelector(".o_tl_row_label")).click();
    expect(headerClicks).toBe(1);
});

test("A12: the card opens at 768 px, nothing opens at 767 px", async () => {
    await mountEmployees();
    await resize({ width: 768 });
    await animationFrame();
    await contains(avatarOf("Anita Oliver")).click();
    await waitFor(".o_avatar_card");
    await contains(".o_avatar_card").press("Escape");
    await animationFrame();
    expect(openCardCount()).toBe(0);
    await resize({ width: 767 });
    await animationFrame();
    await contains(avatarOf("Anita Oliver")).click();
    await animationFrame();
    expect(openCardCount()).toBe(0);
});

test("A14: the pointer on the avatar shows the employee's name as a tooltip", async () => {
    await mountEmployees();
    const avatar = avatarOf("Anita Oliver");
    expect(avatar).toHaveAttribute("data-tooltip", "Anita Oliver");
    await hover(avatar);
    await advanceTime(500);
    expect(".o-tooltip").toHaveCount(1);
    expect(".o-tooltip").toHaveText("Anita Oliver");
});

// ----------------------------------------------------------------------------
// R7
// ----------------------------------------------------------------------------

/** UTC server text of the unavailable periods of the Month range of November (Brussels). */
function hourlyPeriods() {
    const periods = [];
    for (const friday of [6, 13, 20, 27]) {
        periods.push({ start: utc(friday, "12:00"), stop: utc(friday + 1, "0:00") });
    }
    for (const saturday of [7, 14, 21, 28]) {
        periods.push({ start: utc(saturday, "0:00"), stop: utc(saturday + 2, "0:00") });
    }
    return periods;
}

const cellsOf = (name) => {
    const row = queryAll(".o_tl_row").find((item) => item.textContent.includes(name));
    return [...row.querySelectorAll(".o_tl_cell")];
};

test("A19: exactly the four split Fridays are shaded diagonally on the month scale", async () => {
    const ids = await makeEmployeeData(["Gantt Hourly"], [["Hourly shift", "Gantt Hourly", [2, "8:00"], [2, "9:00"]]]);
    timelineMock.unavailability = { employee_id: { [ids["Gantt Hourly"]]: hourlyPeriods() } };
    await start();
    await mountView({
        type: "gantt",
        resModel: "hrg.shift",
        arch: ARCH(`default_range="month" display_unavailability="1"`),
        groupBy: ["employee_id"],
    });
    await animationFrame();
    const diagonal = cellsOf("Gantt Hourly").filter((cell) =>
        (cell.getAttribute("style") || "").includes("325deg")
    );
    expect(diagonal).toHaveCount(4);
    expect(diagonal[0].getAttribute("style")).toInclude(
        "linear-gradient(325deg, var(--o-hrg-available-bg, transparent) 49%, var(--o-tl-unavailable-bg) 50%)"
    );
});

test("A20: quarter precision keeps 002a's vertical quarters", async () => {
    const ids = await makeEmployeeData(["Gantt Hourly"], [["Hourly shift", "Gantt Hourly", [2, "8:00"], [2, "9:00"]]]);
    timelineMock.unavailability = {
        employee_id: {
            [ids["Gantt Hourly"]]: [
                { start: utc(9, "0:00"), stop: utc(9, "6:00") },
                { start: utc(9, "18:00"), stop: utc(10, "0:00") },
            ],
        },
    };
    await start();
    await mountView({
        type: "gantt",
        resModel: "hrg.shift",
        arch: ARCH(`default_range="week" display_unavailability="1"`),
        groupBy: ["employee_id"],
    });
    await animationFrame();
    const styles = cellsOf("Gantt Hourly").map((cell) => cell.getAttribute("style") || "");
    expect(styles.filter((style) => style.includes("325deg")).length).toBe(0);
    expect(styles.filter((style) => style.includes("linear-gradient(to right")).length).toBe(1);
});

test("A20: half-hour parts on the day scale are not shaded diagonally", async () => {
    const ids = await makeEmployeeData(["Gantt Hourly"], [["Hourly shift", "Gantt Hourly", [11, "8:00"], [11, "9:00"]]]);
    // the first half of the 8:00 column is unavailable
    timelineMock.unavailability = {
        employee_id: { [ids["Gantt Hourly"]]: [{ start: utc(11, "8:00"), stop: utc(11, "8:30") }] },
    };
    await start();
    await mountView({
        type: "gantt",
        resModel: "hrg.shift",
        arch: ARCH(`default_range="day" display_unavailability="1"`, HALF_HOUR_PRECISION),
        groupBy: ["employee_id"],
    });
    await animationFrame();
    const styles = cellsOf("Gantt Hourly").map((cell) => cell.getAttribute("style") || "");
    expect(styles.filter((style) => style.includes("325deg")).length).toBe(0);
    expect(styles.filter((style) => style.includes("linear-gradient(to right")).length).toBe(1);
});
