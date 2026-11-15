// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, onMounted, t, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

/** Width of the panel when the view opens, in pixels (M29). */
export const PANEL_WIDTH = 262;
/** The lines the list shows when it is read, and what each Load more adds (R19). */
export const PANEL_LIMIT = 20;
export const PANEL_LIMIT_STEP = 20;

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
 * The title with the count and the list of the records to schedule, twenty lines at a time; the
 * resizing and the drag of a line come with later tasks and extend this component (`renderer` is the renderer's own object, for
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

    setup() {
        onMounted(() => this.props.model.ensurePanel());
    }

    get title() {
        return panelTitleText(this.props.model.panel.count);
    }

    get records() {
        return this.props.model.panel.records;
    }

    /** Load more shows while the list holds fewer lines than there are records. */
    get hasMore() {
        const { records, count } = this.props.model.panel;
        return records.length < count;
    }

    /** A click on a line: 002b's record dialog of the record; closing it reloads the view. */
    onLineClick(record) {
        this.props.renderer?.props.editor?.openRecord(record.id);
    }

    /** Load more: the selection of the grid is cleared (R9), then twenty more lines are read. */
    onLoadMore() {
        this.props.renderer?.clearPicked();
        this.props.model.loadMorePanel();
    }

    onStripPointerDown(ev) {
        this.props.onResizeStart?.(ev);
    }
}
