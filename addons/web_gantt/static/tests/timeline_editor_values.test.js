// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { drag, hover, keyDown, keyUp, queryAll, queryOne, queryRect, resize } from "@odoo/hoot-dom";
import { advanceTime, animationFrame } from "@odoo/hoot-mock";
import {
    contains,
    defineWebModels,
    mountView,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { registry } from "@web/core/registry";
import { TimelineEditor } from "@web_gantt/timeline_editor";
import { timelineView } from "@web_gantt/timeline_view";

import { HOST_ARCHS, setupTimelineFixtures } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();
defineWebModels();

/** What the variant saw, and the server calls. */
let seen;
let log;

class ValueEditor extends TimelineEditor {
    writeValuesFor(change) {
        seen.push({ hook: "write", kind: change.kind, steps: change.steps, name: change.record.name });
        return { ...change.values, x_variant: change.kind };
    }

    undoValuesFor(change) {
        seen.push({ hook: "undo", kind: change.kind, write: change.writeValues });
        return { ...change.values, x_variant_undo: change.kind };
    }
}

beforeEach(async () => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    seen = [];
    log = [];
    onRpc("write", ({ args }) => {
        log.push({ call: "write", values: args[1] });
    });
    onRpc("copy", ({ kwargs }) => {
        log.push({ call: "copy", default: kwargs.default });
    });
    onRpc("gantt_undo_drag_drop", ({ kwargs }) => {
        log.push({ call: "undo", values: kwargs.values });
        return true;
    });
    await resize({ width: 1600, height: 900 });
});

async function mountVariant() {
    registry.category("views").add("test_values_gantt", { ...timelineView, Editor: ValueEditor });
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: HOST_ARCHS.H1.replace("<gantt ", '<gantt js_class="test_values_gantt" '),
    });
    await animationFrame();
    log.length = 0;
}

const pillEl = (name) => {
    const id = { Review: 6, Build: 5 }[name];
    return queryOne(`.o_tl_pill[data-pill-id="${id}"]:not(.o_tl_pill_moved)`);
};
const rowOf = () => queryAll(".o_tl_row:not(.o_tl_total_row):not(.o_tl_group_row)")[0];
const partWidth = () => {
    const col = queryOne('.o_tl_col[data-date="2026-11-12"]');
    return queryRect(rowOf().querySelectorAll(".o_tl_cell")[Number(col.dataset.index)]).width / 2;
};

async function dragPill(name, dx, { handle } = {}) {
    if (handle) {
        await hover(pillEl(name));
        await animationFrame();
    }
    const element = handle ? queryOne(`.o_tl_pill[data-pill-id="5"] .o_tl_handle_${handle}`) : pillEl(name);
    const rect = queryRect(element);
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const helpers = await drag(element, { position: start });
    const x = start.x + dx;
    const target = document.elementFromPoint(x, start.y) || queryOne(".o_tl_renderer");
    await helpers.moveTo(target, { position: { x, y: start.y } });
    await animationFrame();
    await helpers.drop();
    await advanceTime(100);
    await animationFrame();
}

test("EditorValues: a move writes the values of the write hook, Undo sends those of the undo hook", async () => {
    await mountVariant();
    await dragPill("Review", 2 * partWidth());
    expect(seen[0]).toEqual({ hook: "write", kind: "move", steps: 2, name: "Review" });
    expect(seen[1].hook).toBe("undo");
    expect(seen[1].kind).toBe("move");
    expect(seen[1].write.x_variant).toBe(undefined);
    expect(log).toHaveLength(1);
    expect(log[0].values.x_variant).toBe("move");
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    const undo = log.find((entry) => entry.call === "undo");
    expect(undo.values.x_variant_undo).toBe("move");
    expect(undo.values.date_start).toBeOfType("string");
});

test("EditorValues: a resize names the edge in the kind", async () => {
    await mountVariant();
    await dragPill("Build", partWidth(), { handle: "stop" });
    expect(seen[0].kind).toBe("resize-stop");
    expect(seen[0].steps).toBe(1);
    expect(log[0].values.x_variant).toBe("resize-stop");
    await contains(".o_notification .o_notification_buttons button").click();
    await animationFrame();
    expect(log.find((entry) => entry.call === "undo").values.x_variant_undo).toBe("resize-stop");
});

test("EditorValues: a copy sends the defaults of the write hook and has no undo hook", async () => {
    await mountVariant();
    await keyDown("ctrl");
    await dragPill("Review", 2 * partWidth());
    await keyUp("ctrl");
    const copy = log.find((entry) => entry.call === "copy");
    expect(seen.filter((entry) => entry.hook === "undo")).toHaveLength(0);
    expect(seen[0].kind).toBe("copy");
    expect(copy.default.x_variant).toBe("copy");
});
