// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { queryAllTexts } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import {
    onRpc,
    patchWithCleanup,
    toggleMenuItem,
    toggleSearchBarMenu,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { user } from "@web/core/user";

import { TimeOffLeaveModel } from "../src/time_off_view";
import { mountTimeOff, REPORT_ARCH, setupTimeOffFixtures } from "./time_off_test_helpers";

describe.current.tags("desktop");

setupTimeOffFixtures();

beforeEach(() => {
    mockTimeZone(1);
    mockDate("2026-11-11T10:00:05Z");
    patchWithCleanup(localization, { weekStart: 7 });
});

const SEARCH = `<search>
    <field name="employee_id"/>
    <filter name="my_team" string="My Team" domain="[('employee_id', '!=', false)]"/>
    <filter name="department" string="My Department" domain="[('employee_id', '!=', false)]"/>
    <filter name="group_employee" string="Employee" context="{'group_by': 'employee_id'}"/>
</search>`;

/**
 * Answers the two counts of the report's defaults: `employees` readable public employees and
 * `subordinates` of the user's own employee. Returns the domains asked.
 */
function answerCounts({ employees, subordinates = 0 }) {
    const asked = [];
    onRpc("hr.employee.public", "search_count", ({ args }) => {
        asked.push(args[0]);
        return args[0].length ? subordinates : employees;
    });
    return asked;
}

function facets() {
    return queryAllTexts(".o_searchview_facet");
}

async function open(counts) {
    const asked = answerCounts(counts);
    await mountTimeOff({
        employees: ["Anita Oliver"],
        report: true,
        expand: true,
        searchViewArch: SEARCH,
        groupBy: [],
        context: { search_default_group_employee: 1 },
    });
    return asked;
}

test("a28 49 employees: only the Employee facet", async () => {
    const asked = await open({ employees: 49 });
    expect(asked).toEqual([[]]);
    expect(facets()).toEqual(["Employee"]);
});

test("a26 50 employees, nobody under the user: My Department and Employee", async () => {
    const asked = await open({ employees: 50, subordinates: 0 });
    expect(asked.length).toBe(2);
    expect(asked[1]).toEqual([["parent_id", "any", [["user_id", "=", user.userId]]]]);
    expect(facets()).toEqual(["My Department", "Employee"]);
});

test("a27 50 employees, someone under the user: My Team and Employee", async () => {
    await open({ employees: 50, subordinates: 2 });
    expect(facets()).toEqual(["My Team", "Employee"]);
});

test("a26 the count is made once per opening, not on a reload", async () => {
    const asked = await open({ employees: 80 });
    expect(asked.length).toBe(2);
    await toggleSearchBarMenu();
    await toggleMenuItem("My Department");
    await animationFrame();
    expect(asked.length).toBe(2);
});

// R7, R21 (A83, A95): 002a's sample mode: only the view's first load, and only when it holds no
// request on its first page in the opening period; the cases of other pages and months are the
// server tests' (a request elsewhere changes no answer of the first page)
for (const [title, records, sample] of [
    ["no request in the opening period", [], true],
    ["a request in the opening period", [["Anita Oliver", [12, "9:00"], [12, "17:00"]]], false],
]) {
    test(`a83 the report view with ${title}: sample ${sample}`, async () => {
        let shown = null;
        patchWithCleanup(TimeOffLeaveModel.prototype, {
            _commit(request, result) {
                super._commit(request, result);
                shown ??= this.isSample;
            },
        });
        answerCounts({ employees: 3 });
        await mountTimeOff({
            employees: ["Anita Oliver"],
            records,
            report: true,
            expand: true,
            arch: REPORT_ARCH(`sample="1"`),
        });
        expect(shown).toBe(sample);
    });
}
