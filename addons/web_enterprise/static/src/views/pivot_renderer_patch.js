// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onMounted, onPatched } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { PivotRenderer } from "@web/views/pivot/pivot_renderer";

const TOOLTIP_ATTRIBUTES = ["data-tooltip", "data-tooltip-info", "data-tooltip-template", "title"];

const pivotRendererProto = PivotRenderer.prototype;
patch(pivotRendererProto, {
    setup() {
        super.setup(...arguments);
        // evaluated once: resizing the window later changes nothing
        const isSmall = this.uiService.isSmall;
        if (isSmall) {
            const strip = () => {
                for (const el of this.tableRef()?.querySelectorAll(
                    TOOLTIP_ATTRIBUTES.map((name) => `[${name}]`).join(",")
                ) ?? []) {
                    for (const name of TOOLTIP_ATTRIBUTES) {
                        el.removeAttribute(name);
                    }
                }
            };
            onMounted(strip);
            onPatched(strip);
        }
    },
});
