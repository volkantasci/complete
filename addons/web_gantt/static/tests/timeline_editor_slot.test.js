// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, mockDate, mockTimeZone, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { mountView, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { localization } from "@web/core/l10n/localization";
import { registry } from "@web/core/registry";
import { TimelineController } from "@web_gantt/timeline_controller";
import { TimelineEditor } from "@web_gantt/timeline_editor";
import { timelineView } from "@web_gantt/timeline_view";

import { HOST_ARCHS, setupTimelineFixtures } from "./timeline_test_helpers";

describe.current.tags("desktop");

setupTimelineFixtures();

let controller;

beforeEach(() => {
    mockTimeZone(3);
    mockDate("2026-11-11 21:30:00");
    patchWithCleanup(localization, { weekStart: 7 });
    patchWithCleanup(TimelineController.prototype, {
        setup() {
            super.setup(...arguments);
            controller = this;
        },
    });
});

test("EditorSlot: the plain view builds the default editor", async () => {
    await mountView({ type: "gantt", resModel: "pill", arch: HOST_ARCHS.H1 });
    await animationFrame();
    expect(controller.editor.constructor).toBe(TimelineEditor);
});

test("EditorSlot: a variant's editor class is the one the controller builds", async () => {
    class VariantEditor extends TimelineEditor {}
    registry.category("views").add("test_editor_gantt", { ...timelineView, Editor: VariantEditor });
    await mountView({
        type: "gantt",
        resModel: "pill",
        arch: HOST_ARCHS.H1.replace("<gantt ", '<gantt js_class="test_editor_gantt" '),
    });
    await animationFrame();
    expect(controller.editor).toBeInstanceOf(VariantEditor);
    expect(controller.editor.model).toBe(controller.model);
});
