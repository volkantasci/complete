// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, onMounted, onWillUnmount, proxy, t, useProps } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { clampPanelWidth } from "./timeline_panel_math";

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
 * resize strip (R20); a click on a line, which opens the record, and the press of a line, which
 * the renderer turns into a drag onto the grid (R21; the renderer gives the callbacks).
 */
export class TimelineSidePanel extends Component {
    static template = "web_gantt.TimelineSidePanel";
    props = useProps({
        model: t.object(),
        // what the grid does for the panel: open a record, press a line, forget the picked
        // cells, tell whether a click is the end of a drag
        onOpen: t.function().optional(),
        onPress: t.function().optional(),
        onClear: t.function().optional(),
        swallowsClick: t.function().optional(),
        width: t.number(),
        zone: t.boolean().optional(),
    });

    setup() {
        this.resizing = proxy({ on: false });
        this._resize = null;
        onMounted(() => this.props.model.ensurePanel());
        onWillUnmount(() => this._endResize());
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

    /**
     * A click anywhere on a line, a press and release without the move of a drag (R19.4): 002b's
     * record dialog of the record; closing it reloads the view. The click that ends a drag opens
     * nothing.
     */
    onLineClick(record) {
        if (this.props.swallowsClick?.()) {
            return;
        }
        this.props.onOpen?.(record.id);
    }

    /** A press on a line starts a drag onto the grid after a move of 10 px (R21). */
    onLinePointerDown(ev, record) {
        this.props.onPress?.(ev, record);
    }

    /** Load more: the selection of the grid is cleared (R9), then twenty more lines are read. */
    onLoadMore() {
        this.props.onClear?.();
        this.props.model.loadMorePanel();
    }

    /**
     * Pressing the left button on the strip resizes the panel while it is held (R20): the width
     * follows the pointer, kept on the model so that it outlives reloads and a closed panel.
     */
    onStripPointerDown(ev) {
        if (ev.button !== 0 || this._resize) {
            return;
        }
        ev.preventDefault();
        const model = this.props.model;
        const startWidth = model.panel.width;
        const startX = ev.clientX;
        const move = (event) => {
            model.panel.width = clampPanelWidth(
                startWidth,
                event.clientX - startX,
                window.innerWidth
            );
        };
        // any key, or a press of another button, ends it like the release does; the window
        // losing the focus does not (R20)
        const end = () => this._endResize(true);
        const press = (event) => {
            if (event.button !== 0) {
                end();
            }
        };
        const listeners = [
            ["pointermove", move],
            ["pointerup", end],
            ["pointercancel", end],
            ["keydown", end],
            ["pointerdown", press],
        ];
        for (const [type, handler] of listeners) {
            browser.addEventListener(type, handler, true);
        }
        this._resize = { listeners };
        this.resizing.on = true;
    }

    /** Ends the resize; the focus leaves the panel when `blur` says so. */
    _endResize(blur = false) {
        const resize = this._resize;
        if (!resize) {
            return;
        }
        this._resize = null;
        for (const [type, handler] of resize.listeners) {
            browser.removeEventListener(type, handler, true);
        }
        this.resizing.on = false;
        if (blur) {
            const active = document.activeElement;
            if (active && active !== document.body && active.closest?.(".o_tl_panel_frame, .o_tl_panel")) {
                active.blur();
            }
        }
    }
}
