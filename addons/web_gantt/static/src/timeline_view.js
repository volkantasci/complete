// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { parseTimelineArch } from "./timeline_arch_parser";
import { TimelineController } from "./timeline_controller";
import { TimelineModel } from "./timeline_model";
import { TimelineRenderer } from "./timeline_renderer";

export const timelineView = {
    type: "gantt",
    display_name: "Gantt",
    icon: "view_timeline",
    multiRecord: true,
    searchMenuTypes: ["filter", "groupBy", "favorite"],

    ArchParser: { parse: (arch, fields) => parseTimelineArch(arch, fields) },
    Controller: TimelineController,
    Model: TimelineModel,
    Renderer: TimelineRenderer,

    props: (genericProps, view) => {
        const { arch, fields } = genericProps;
        return {
            ...genericProps,
            archInfo: view.ArchParser.parse(arch, fields),
            Model: view.Model,
            Renderer: view.Renderer,
        };
    },
};

registry.category("views").add("gantt", timelineView);
