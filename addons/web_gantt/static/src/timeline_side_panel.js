// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, t, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

/** Width of the panel when the view opens, in pixels (M29). */
export const PANEL_WIDTH = 262;

/**
 * The panel and its button exist when the scheduling option and the edit permission are on, the
 * screen is not a phone and the view is not showing sample data (002b3 R17, R24).
 */
export function hasSidePanel({ archInfo, isSmall, isSample }) {
    return Boolean(archInfo.canSchedule && archInfo.canEdit && !isSmall && !isSample);
}

/**
 * The text of the panel title and of the count before the panel button (E6): the number of
 * records to schedule, or the sentence that there is none. Empty while the count is not known.
 */
export function panelTitleText(count) {
    if (count === null || count === undefined) {
        return "";
    }
    return count ? _t("Unscheduled: %s", count) : _t("All records are scheduled");
}

/**
 * The side panel of the records to schedule (002b3 R16 to R20): the resize strip on its left and
 * the panel itself. The renderer draws it beside the grid box while `model.panel.open` holds.
 * This is the frame: the title with the count; the list, the resizing and the drag of a line
 * come with later tasks and extend this component (`renderer` is the renderer's own object, for
 * the drag onto the grid).
 */
export class TimelineSidePanel extends Component {
    static template = "web_gantt.TimelineSidePanel";
    props = useProps({
        model: t.object(),
        renderer: t.object().optional(),
        width: t.number(),
        onResizeStart: t.function().optional(),
    });

    get title() {
        return panelTitleText(this.props.model.panel.count);
    }

    onStripPointerDown(ev) {
        this.props.onResizeStart?.(ev);
    }
}
