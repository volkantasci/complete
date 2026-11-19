// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { contains, getService, mountView, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { registry } from "@web/core/registry";
import { TimelineEditor } from "@web_gantt/timeline_editor";
import { timelineView } from "@web_gantt/timeline_view";

import { HOST_ARCHS, setupTimelineFixtures, timelineArch } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
});

class ScaleEditor extends TimelineEditor {
    creationContextFor(params) {
        return { ...super.creationContextFor(params), scale: "week", default_note: "from variant" };
    }
}

async function mountVariant(arch) {
    registry.category("views").add("test_context_gantt", { ...timelineView, Editor: ScaleEditor });
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: arch.replace("<gantt ", '<gantt js_class="test_context_gantt" '),
    });
    await animationFrame();
}

test("EditorContext: the context of a variant's hook reaches the create dialog", async () => {
    await mountVariant(HOST_ARCHS.H1);
    let dialogProps;
    patchWithCleanup(getService("dialog"), {
        add(Component, props, options) {
            dialogProps = props;
            return super.add(Component, props, options);
        },
    });
    await contains(".o_tl_button_add").click();
    await animationFrame();
    expect(dialogProps.context.scale).toBe("week");
    expect(dialogProps.context.default_note).toBe("from variant");
    // the default context is kept
    expect(dialogProps.context.default_date_start).toBeOfType("string");
});

test("EditorContext: the context of a variant's hook reaches the create action", async () => {
    await mountVariant(timelineArch(`default_range="week" on_create="17"`));
    const calls = [];
    patchWithCleanup(getService("action"), {
        doAction(action, options) {
            calls.push({ action, options });
        },
    });
    await contains(".o_tl_button_add").click();
    await animationFrame();
    expect(calls).toHaveLength(1);
    expect(calls[0].options.additionalContext.scale).toBe("week");
});
