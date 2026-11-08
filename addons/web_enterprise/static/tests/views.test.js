// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, test } from "@odoo/hoot";
import { advanceTime, animationFrame, queryAll, queryOne, resize, scroll } from "@odoo/hoot";
import {
    contains,
    defineActions,
    defineModels,
    fields,
    getService,
    models,
    mountView,
    mountWebClient,
    onRpc,
} from "@web/../tests/web_test_helpers";

import { getSwitchMemory } from "@web_enterprise/views/view_switcher_patch";

describe.current.tags("desktop");

class Stage extends models.Model {
    name = fields.Char();
    fold = fields.Boolean();
    _records = [
        { id: 1, name: "New" },
        { id: 2, name: "Qualified" },
        { id: 3, name: "Won", fold: true },
    ];
}

class Lead extends models.Model {
    name = fields.Char();
    stage_id = fields.Many2one({ relation: "stage" });
    amount = fields.Float();

    _records = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        name: `Lead ${i + 1}`,
        stage_id: (i % 3) + 1,
        amount: i * 10,
    }));
    _views = {
        kanban: `<kanban default_group_by="stage_id">
            <templates><t t-name="card"><field name="name"/></t></templates>
        </kanban>`,
        list: `<list><field name="name"/></list>`,
        pivot: `<pivot><field name="stage_id" type="row"/><field name="amount" type="measure"/></pivot>`,
        search: `<search><field name="name"/></search>`,
    };
}
defineModels([Stage, Lead]);

onRpc("has_group", () => true);

defineActions([
    {
        id: 1,
        name: "Pipeline",
        res_model: "lead",
        views: [
            [false, "kanban"],
            [false, "list"],
            [false, "pivot"],
        ],
    },
    {
        id: 2,
        name: "Other",
        res_model: "lead",
        views: [
            [false, "list"],
            [false, "kanban"],
        ],
    },
]);

function switcher() {
    return queryOne(".o_cp_switch_buttons");
}

describe("view switcher", () => {
    test("A62 switcher slides between views", async () => {
        await mountWebClient();
        await getService("action").doAction(1);
        expect(".o_kanban_view").toHaveCount(1);
        expect(switcher()).toHaveAttribute("data-cws-views", "3");
        expect(switcher()).toHaveAttribute("data-cws-from", "0");
        expect(switcher()).toHaveAttribute("data-cws-active", "0");

        await contains(".o_switch_view.o_list").click();
        expect(".o_list_view").toHaveCount(1);
        expect(switcher()).toHaveAttribute("data-cws-from", "0");
        expect(switcher()).toHaveAttribute("data-cws-active", "1");
        expect(switcher().style.getPropertyValue("--cws-switch-from").trim()).toBe("0");
        expect(switcher().style.getPropertyValue("--cws-switch-to").trim()).toBe("1");

        await contains(".o_switch_view.o_pivot").click();
        expect(".o_pivot_view").toHaveCount(1);
        expect(switcher()).toHaveAttribute("data-cws-from", "1");
        expect(switcher()).toHaveAttribute("data-cws-active", "2");
        expect(getSwitchMemory()).toBe(null);
    });

    test("A63 no slide on a fresh action or a new tab", async () => {
        await mountWebClient();
        await getService("action").doAction(1);
        await contains(".o_switch_view.o_list").click();
        expect(switcher()).toHaveAttribute("data-cws-from", "0");
        // another action opened fresh: the highlight starts at its active view
        await getService("action").doAction(2, { clearBreadcrumbs: true });
        await animationFrame();
        expect(".o_list_view").toHaveCount(1);
        expect(switcher()).toHaveAttribute("data-cws-from", "0");
        expect(switcher()).toHaveAttribute("data-cws-active", "0");
        // the same action opened fresh after a switch: no slide either
        await getService("action").doAction(1, { clearBreadcrumbs: true });
        await animationFrame();
        expect(switcher()).toHaveAttribute("data-cws-from", "0");
        await contains(".o_switch_view.o_pivot").click();
        expect(switcher()).toHaveAttribute("data-cws-from", "0");
        expect(switcher()).toHaveAttribute("data-cws-active", "2");
        await getService("action").doAction(1, { clearBreadcrumbs: true });
        await animationFrame();
        expect(switcher()).toHaveAttribute("data-cws-from", "0");
        expect(switcher()).toHaveAttribute("data-cws-active", "0");
    });

    test("A63 modifier click writes nothing", async () => {
        await mountWebClient();
        await getService("action").doAction(1);
        await contains(".o_switch_view.o_list").click({ ctrlKey: true });
        await animationFrame();
        expect(getSwitchMemory()).toBe(null);
        expect(".o_kanban_view").toHaveCount(1);
        expect(switcher()).toHaveAttribute("data-cws-from", "0");
        expect(switcher()).toHaveAttribute("data-cws-active", "0");
    });
});

describe("sticky kanban header", () => {
    test("A64 sticky header", async () => {
        await resize({ height: 300 });
        await mountView({ resModel: "lead", type: "kanban" });
        const content = ".o_content";
        expect(".o_kanban_header").toHaveCount(3);
        expect(".o_kanban_header.o_cws_stuck").toHaveCount(0);
        const unfolded = ".o_kanban_group:not(.o_column_folded) .o_kanban_header";
        for (const header of queryAll(unfolded)) {
            expect(getComputedStyle(header).paddingBottom).toBe("8px");
        }
        await scroll(content, { top: 200 });
        await animationFrame();
        await advanceTime(200);
        expect(queryOne(content).scrollTop).toBeGreaterThan(0);
        expect(".o_kanban_header.o_cws_stuck").toHaveCount(2);
        expect(".o_column_folded .o_cws_stuck").toHaveCount(0);
        for (const header of queryAll(unfolded)) {
            expect(getComputedStyle(header).paddingBottom).toBe("16px");
            expect(getComputedStyle(header, "::before").backgroundImage).toMatch(/linear-gradient/);
        }
        await scroll(content, { top: 0 });
        await animationFrame();
        await advanceTime(200);
        expect(".o_kanban_header.o_cws_stuck").toHaveCount(0);
        for (const header of queryAll(unfolded)) {
            expect(getComputedStyle(header).paddingBottom).toBe("8px");
        }
    });

    test("A65 folded columns never stuck", async () => {
        await resize({ height: 300 });
        await mountView({ resModel: "lead", type: "kanban" });
        expect(".o_column_folded").toHaveCount(1);
        await scroll(".o_content", { top: 200 });
        await animationFrame();
        await advanceTime(200);
        const folded = queryOne(".o_column_folded .o_kanban_header");
        expect(folded).not.toHaveClass("o_cws_stuck");
        expect(getComputedStyle(folded).paddingBottom).toBe("8px");
        expect(getComputedStyle(folded, "::before").content).toBe("none");
        expect(".o_kanban_header.o_cws_stuck").toHaveCount(2);
    });

    test("A65 folded columns on a phone", async () => {
        await resize({ width: 390, height: 300 });
        await mountView({ resModel: "lead", type: "kanban" });
        await animationFrame();
        const folded = queryAll(".o_kanban_header")[1];
        expect(".o_column_folded").toHaveCount(0);
        expect(getComputedStyle(folded).paddingTop).toBe("8px");
        expect(getComputedStyle(folded).paddingBottom).toBe("8px");
    });
});

describe("pivot tooltips", () => {
    test("A66 no pivot tooltips on small screens", async () => {
        await resize({ width: 390 });
        await mountView({ resModel: "lead", type: "pivot" });
        await animationFrame();
        expect(".o_pivot table [data-tooltip], .o_pivot table [title]").toHaveCount(0);
        expect(".o_pivot_header_cell_closed").not.toHaveCount(0);
        await contains(".o_pivot_header_cell_closed").click();
        await contains(".dropdown-menu .dropdown-item:first").click();
        await animationFrame();
        expect(".o_pivot table [data-tooltip], .o_pivot table [title]").toHaveCount(0);
        const rows = queryAll("tbody th");
        expect(getComputedStyle(rows[0]).paddingLeft).toBe("5px");
        expect(getComputedStyle(rows[1]).paddingLeft).toBe("35px");
    });

    test("A66 pivot keeps its tooltips on large screens", async () => {
        await resize({ width: 1600 });
        await mountView({ resModel: "lead", type: "pivot" });
        await animationFrame();
        expect(".o_pivot th[data-tooltip]").not.toHaveCount(0);
    });
});
