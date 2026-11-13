// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import {
    Component,
    onMounted,
    onPatched,
    onWillRender,
    onWillUnmount,
    proxy,
    signal,
    t,
    useProps,
} from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { ActionHelper } from "@web/views/action_helper";
import { usePopover } from "@web/core/popover/popover_hook";
import { _t } from "@web/core/l10n/translation";
import { is24HourFormat } from "@web/core/l10n/time";
import { evaluateBooleanExpr } from "@web/core/py_js/py";
import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";
import {
    colorIndexOf,
    foldableRuns,
    formatHours,
    pillLabel,
    rowHeightFor,
    segmentCounts,
    stackPills,
    totalBars,
    unavailableParts,
} from "./timeline_layout";
import { columnWidth } from "./timeline_dates";
import {
    copyDefaults,
    dragBadges,
    dragStep,
    hasDateOnlyBound,
    moveWriteValues,
    movedBounds,
    rowAcceptsDrop,
    undoValues,
} from "./timeline_drag_math";
import { TimelinePillDrag } from "./timeline_drag";
import { badgeText, columnPeriod, partPeriod, rowValueChain } from "./timeline_editing";
import { POPOVER_DELAY, TimelinePopover } from "./timeline_popover";
import { TimelineSelection } from "./timeline_selection";

const { DateTime } = luxon;

/** Decoration names in the order the corner mark picks one when several hold. */
const DECORATION_ORDER = ["danger", "warning", "success", "info", "secondary"];
/** Vertical space of one line of pills, and the gap above the first pill of a line. */
const LINE_STEP = 25;
// each side of a pill is one pixel inside its columns (the progress fill is 75 % of what is left)
const PILL_INSET = 1;
const LINE_GAP = 2;
const GROUP_ROW_HEIGHT = 40;
/** Distance from the top of the selection to the top of its start badge (R5). */
const BADGE_HEIGHT = 20;

/**
 * R5/R19: place the two time badges of a highlight (or a moved pill) `rect` inside `grid`.
 * Left to right: the start badge stands 20 px above the rectangle, its left edge at the
 * rectangle's, but never left of the row header; the stop badge stands right below it, its right
 * edge at the rectangle's. Right to left the two swap sides and vertical places: the start badge
 * stands below the rectangle, its right edge at the rectangle's (not past the row header, which
 * is then on the right), the stop badge 20 px above it, its left edge at the rectangle's.
 */
export function placeBoundBadges(grid, rect, header, rtl, startBadge, stopBadge) {
    const box = grid.getBoundingClientRect();
    const bounds = header?.getBoundingClientRect();
    const startWidth = startBadge.getBoundingClientRect().width;
    const stopWidth = stopBadge.getBoundingClientRect().width;
    let startLeft;
    let startTop;
    let stopLeft;
    let stopTop;
    if (rtl) {
        const right = bounds ? Math.min(rect.right, bounds.left) : rect.right;
        startLeft = right - startWidth;
        startTop = rect.bottom;
        stopLeft = rect.left;
        stopTop = rect.top - BADGE_HEIGHT;
    } else {
        startLeft = bounds ? Math.max(rect.left, bounds.right) : rect.left;
        startTop = rect.top - BADGE_HEIGHT;
        stopLeft = rect.right - stopWidth;
        stopTop = rect.bottom;
    }
    startBadge.style.left = `${startLeft - box.left}px`;
    startBadge.style.top = `${startTop - box.top}px`;
    stopBadge.style.left = `${stopLeft - box.left}px`;
    stopBadge.style.top = `${stopTop - box.top}px`;
}
/** Width of a folded column, in pixels (M45). */
const FOLDED_WIDTH = 36;
/** Clicks on cells are ignored this long after a click on a cell (R7: a double click opens one dialog). */
export const CELL_CLICK_LOCK = 1000;
/** ... and this long after the popover closes, unless a lock already runs (R7). */
export const POPOVER_CLOSE_LOCK = 250;

/** The date with its weekday, as the language writes it (P2: "Saturday, November 7, 2026"). */
function textOfDate(date) {
    return date.toLocaleString(DateTime.DATE_HUGE);
}

/**
 * The time grid of the timeline view: title cell, column group headers, column headers, one row
 * per visible row with its cells and pills.
 *
 * Extension points for later tasks:
 * - `layout.rows` holds one descriptor per body row (`kind`: "pills" or "group"); the template
 *   draws the row header, the cells and the pills layer of each, so the group row look, the total
 *   row, folded columns and capacity bars plug into `_buildRows` and the row branches of the
 *   template;
 * - `pillOf(record, line)` builds the description of one pill;
 * - `visibleMiddleDate()` answers the date in the middle of the visible part of the grid.
 *
 * Scrolling (R39): the element that scrolls is `.o_tl_renderer`. All measures are made on
 * rectangles, so they hold in right-to-left languages, where the grid is mirrored.
 */
export class TimelineRenderer extends Component {
    static template = "web_gantt.TimelineRenderer";
    static components = { ActionHelper };
    props = useProps({
        model: t.object(),
        archInfo: t.object(),
        editor: t.object().optional(),
        noContentHelp: t.string().optional(),
    });

    rendererRef = signal.ref();

    setup() {
        this.ui = useService("ui");
        this._cache = { data: null, small: null, version: null, layout: null };
        // folded columns: the runs the user opened, by the index of their first column; reset when
        // the range or the scale changes. `state.version` makes a change redraw the grid.
        this.state = proxy({ version: 0, selection: null, drag: null });
        this._opened = new Set();
        this._openedKey = null;
        this._fold = null;
        this._popoverTimer = null;
        this._popoverFor = null;
        this._clickLock = null;
        this._seenData = null;
        this._rowEl = null;
        this._selecting = new TimelineSelection({
            partAt: (x, anchor) => this._partAt(x, anchor),
            edges: () => this._visibleBounds(),
            scrollBy: (dx) => {
                const renderer = this.rendererRef();
                const before = renderer.scrollLeft;
                renderer.scrollLeft += dx;
                return { dx: renderer.scrollLeft - before, dy: 0 };
            },
            change: (selection) => this._setSelection(selection),
            commit: (selection) => this._commitSelection(selection),
            hold: (on) => this._hold(on),
        });
        this._drag = new TimelinePillDrag({
            pillState: (pill) => this._pillState(pill),
            targetAt: (x, y, grab) => this._targetAt(x, y, grab),
            edges: () => this._visibleBounds(),
            scrollBy: (dx, dy) => {
                const renderer = this.rendererRef();
                const before = { left: renderer.scrollLeft, top: renderer.scrollTop };
                renderer.scrollLeft += dx;
                renderer.scrollTop += dy;
                return {
                    dx: renderer.scrollLeft - before.left,
                    dy: renderer.scrollTop - before.top,
                };
            },
            change: (drawing) => this._setDrag(drawing),
            commit: (result) => this._commitDrag(result),
            hold: (mode) => this._holdDrag(mode),
        });
        // where the pressed pill stood (grid coordinates) and how far the grid had scrolled
        this._pressed = null;
        this._drawing = null;
        this._dragMode = null;
        this.popover = usePopover(TimelinePopover, {
            position: "bottom",
            // a click on the pill the popover hangs from is handled by the pill (it toggles)
            closeOnClickAway: (target) => !this._isPopoverAnchor(target),
            onClose: () => {
                // only a popover that was really open locks the cells (closing none does not)
                if (this._popoverFor !== null) {
                    this._lockClicks(POPOVER_CLOSE_LOCK, false);
                }
                this._popoverFor = null;
            },
        });
        // new data (reload, step, range change) may remove or redraw the pill: close the popover
        onWillRender(() => {
            if (this._seenData !== this.data) {
                this._seenData = this.data;
                this._cancelPopover();
                this.popover.close();
            }
        });
        // the grid scrolls to the focus date whenever the model says so (new range, new scale, a
        // Today inside the period) and once the grid is first drawn
        this._scrolledVersion = null;
        const model = this.props.model;
        const access = {
            middleDate: () => this.visibleMiddleDate(),
            scroll: () => this._scrollState(),
        };
        model.setViewAccess(access);
        onMounted(() => this._syncScroll());
        onPatched(() => {
            this._syncScroll();
            this._placeBadges();
        });
        onWillUnmount(() => {
            this._selecting.destroy();
            this._drag.destroy();
            browser.clearTimeout(this._popoverTimer);
            browser.clearTimeout(this._clickLock);
            if (model._view === access) {
                model.setViewAccess(null);
            }
        });
    }

    // ------------------------------------------------------------------------
    // Scrolling (R39)
    // ------------------------------------------------------------------------

    _scrollState() {
        const element = this.rendererRef();
        return element ? { left: element.scrollLeft, top: element.scrollTop } : null;
    }

    /** The first display, or a new focus: restore the saved position, else centre the focus. */
    _syncScroll() {
        const element = this.rendererRef();
        const data = this.data;
        if (!element || !element.clientWidth || this._scrolledVersion === data.focusVersion) {
            return;
        }
        this._scrolledVersion = data.focusVersion;
        const model = this.props.model;
        const restored = model.restoredScroll;
        if (restored) {
            model.restoredScroll = null;
            element.scrollLeft = restored.left;
            element.scrollTop = restored.top;
            return;
        }
        this._centreDate(data.range.focus);
    }

    /** Header elements of the columns, in order; a folded run has one, for its first column. */
    _headers() {
        return [...this.rendererRef().querySelectorAll(".o_tl_col[data-index]")];
    }

    /** The part of the grid that is not under the sticky title cell, in viewport coordinates. */
    _visibleBounds() {
        const element = this.rendererRef();
        const box = element.getBoundingClientRect();
        let left = box.left + element.clientLeft;
        let right = left + element.clientWidth;
        const title = element.querySelector(".o_tl_title_cell");
        if (title) {
            const rect = title.getBoundingClientRect();
            if (rect.left + rect.width / 2 < (left + right) / 2) {
                left = Math.max(left, rect.right);
            } else {
                right = Math.min(right, rect.left);
            }
        }
        return { left, right };
    }

    /** Scroll the grid so that the viewport coordinate `x` is in the middle of the visible part. */
    _centreAt(x) {
        const { left, right } = this._visibleBounds();
        this.rendererRef().scrollLeft += x - (left + right) / 2;
    }

    /**
     * The date in the middle of the visible part of the grid; the focus date without a grid (R39).
     * It is a linear share of the displayed period (R18): the column under the middle point and
     * the place of that point inside it give the day and the time, so on the year scale the
     * middle of a month column is a day of that month, not its first day.
     */
    visibleMiddleDate() {
        const element = this.rendererRef?.();
        const headers = element?.clientWidth ? this._headers() : [];
        if (!headers.length) {
            return this.data.range.focus;
        }
        const { left, right } = this._visibleBounds();
        // the focus day starts at the middle (R39); a pixel of slack keeps the rounding of the
        // scroll offset from picking the day before
        const x = (left + right) / 2 + (this._isRtl() ? -1 : 1);
        let best = null;
        let distance = Infinity;
        for (const header of headers) {
            const rect = header.getBoundingClientRect();
            const away = x < rect.left ? rect.left - x : x >= rect.right ? x - rect.right : 0;
            if (away < distance) {
                best = header;
                distance = away;
            }
        }
        const column = this.data.columns[Number(best.dataset.index)];
        if (!column) {
            return this.data.range.focus;
        }
        if (best.classList.contains("o_tl_folded")) {
            return column.start.startOf("day");
        }
        const rect = best.getBoundingClientRect();
        const share = this._isRtl() ? (rect.right - x) / rect.width : (x - rect.left) / rect.width;
        const length = column.stop - column.start;
        const inside = Math.min(Math.max(share, 0), 1) * length;
        return column.start.plus({ milliseconds: Math.min(inside, length - 1) });
    }

    /**
     * Put the start of the day of `date` in the middle of the visible part (R39: the focus is the
     * start of the focus day, so on the week scale the focus column starts at the middle; on the
     * year scale the focus lies inside its month column); false when it is not shown.
     */
    _centreDate(date) {
        const { columns } = this.data;
        const from = date.startOf("day");
        const index = columns.findIndex((column) => column.start <= from && column.stop > from);
        if (index < 0) {
            return false;
        }
        const header = this._headers()
            .filter((element) => Number(element.dataset.index) <= index)
            .at(-1);
        if (!header) {
            return false;
        }
        const rect = header.getBoundingClientRect();
        const column = columns[index];
        const exact =
            Number(header.dataset.index) === index && !header.classList.contains("o_tl_folded");
        const fraction = exact ? (from - column.start) / (column.stop - column.start) : 0;
        // the day starts at the right in a mirrored grid
        const shift = rect.width * fraction;
        this._centreAt(this._isRtl() ? rect.right - shift : rect.left + shift);
        return true;
    }

    _isRtl() {
        return getComputedStyle(this.rendererRef()).direction === "rtl";
    }

    /** A click on the header of a row that is not a group scrolls to its first pill's column (R39). */
    onRowHeaderClick(descriptor) {
        if (descriptor.kind !== "pills" || !descriptor.pills.length) {
            return;
        }
        const first = descriptor.pills.reduce((best, pill) =>
            pill.record.span.from < best.record.span.from ? pill : best
        );
        const row = [...this.rendererRef().querySelectorAll(".o_tl_row")].find(
            (element) => element.dataset.rowId === descriptor.row.id
        );
        const pill = [...(row?.querySelectorAll(".o_tl_pill") || [])].find(
            (element) => element.dataset.pillId === String(first.id)
        );
        if (pill) {
            this._centreAt(this._columnStartOf(pill));
        }
    }

    /**
     * Viewport coordinate of the start of the column in which the pill starts (R39): the left edge
     * of that column header, the right edge in a mirrored grid. A pill that starts inside a column
     * is not followed to its own start.
     */
    _columnStartOf(pill) {
        const rect = pill.getBoundingClientRect();
        const headers = this._headers().map((header) => header.getBoundingClientRect());
        if (this._isRtl()) {
            const edges = headers.map((box) => box.right).filter((edge) => edge >= rect.right - 0.5);
            return edges.length ? Math.min(...edges) : rect.right;
        }
        const edges = headers.map((box) => box.left).filter((edge) => edge <= rect.left + 0.5);
        return edges.length ? Math.max(...edges) : rect.left;
    }

    /**
     * A single click on a pill opens its popover after a short delay; a double click comes in
     * between and cancels it (R30). The open popover closes on the click itself (click away) and
     * the new one opens, so another pill swaps the popovers.
     */
    onPillClick(ev, pill) {
        if (this._drag.consumeClick() || (this._drag.justReleased && ev.detail > 1)) {
            // the release of a move or a copy (or of a cancelled one) is no click, and nor is the
            // second click of a double click that began with it (R9, R-T11-1)
            ev.stopPropagation();
            return;
        }
        const target = ev.currentTarget;
        browser.clearTimeout(this._popoverTimer);
        if (this.popover.isOpen && this._popoverFor === pill.id) {
            // a second click on the anchor of the open popover closes it, without flicker
            this._popoverTimer = null;
            this.popover.close();
            return;
        }
        this._popoverTimer = browser.setTimeout(() => {
            this._popoverTimer = null;
            this.popover.open(target, {
                model: this.props.model,
                archInfo: this.props.archInfo,
                record: pill.record,
                editor: this.props.editor,
            });
            // after `open`, which first closes (and so forgets) the previous popover
            this._popoverFor = pill.id;
        }, POPOVER_DELAY);
    }

    onPillDoubleClick(ev, pill) {
        this._cancelPopover();
        if (this._drag.justReleased) {
            // the second press of a double click that began with the end of a gesture (R9)
            return;
        }
        this.props.editor?.openRecord(pill.record.resId);
    }

    _cancelPopover() {
        browser.clearTimeout(this._popoverTimer);
        this._popoverTimer = null;
    }

    _isPopoverAnchor(target) {
        return (
            this._popoverFor !== null &&
            Boolean(target.closest?.(`.o_tl_pill[data-pill-id="${this._popoverFor}"]`))
        );
    }

    get data() {
        return this.props.model.data;
    }

    /** A click on a group row (its header or a cell) folds or opens it (R22). */
    onRowClick(descriptor) {
        if (descriptor.kind === "group") {
            this.props.model.toggleRow(descriptor.row.id);
        }
    }

    /**
     * Ignore the clicks on cells for `delay` ms. With `replace` false a running lock stays (the
     * popover closing does not shorten or extend the lock of a cell click).
     */
    _lockClicks(delay, replace) {
        if (this._clickLock !== null && !replace) {
            return;
        }
        browser.clearTimeout(this._clickLock);
        this._clickLock = browser.setTimeout(() => {
            this._clickLock = null;
        }, delay);
    }

    /**
     * R7, R23: a click on a body cell. Locked: nothing. A folded cell opens its run. A group row
     * toggles (through the row's own click). A cell of a record row plans (plan on), creates
     * (cell create on) or does nothing, for the whole column. The total row and the sample
     * state do nothing.
     */
    onCellClick(ev, cell, descriptor = null) {
        if (this._selecting.consumeClick() || this._drag.consumeClick()) {
            // the release of a selection or of a pill gesture (or of a cancelled one) is no click
            ev.stopPropagation();
            return;
        }
        if (this._clickLock !== null) {
            ev.stopPropagation();
            return;
        }
        if (this.data.isSample) {
            return;
        }
        if (!descriptor) {
            // the total row starts no lock and plans nothing, but a folded cell still opens
            if (cell.run !== undefined) {
                ev.stopPropagation();
                this._setRunOpen(cell.run, true);
            }
            return;
        }
        // R23: a click on a cell of a record row, or on a folded cell, locks the next ones (a
        // double click acts once); a click on a group row cell only toggles the row
        if (descriptor.kind !== "group" || cell.run !== undefined) {
            this._lockClicks(CELL_CLICK_LOCK, true);
        }
        if (cell.run !== undefined) {
            ev.stopPropagation();
            this._setRunOpen(cell.run, true);
            return;
        }
        if (descriptor.kind !== "pills") {
            return;
        }
        const { archInfo, editor } = this.props;
        if (!editor || cell.column === undefined || !(archInfo.canPlan || archInfo.canCellCreate)) {
            return;
        }
        const params = { period: columnPeriod(this.data, cell.column), row: descriptor.row };
        if (archInfo.canPlan) {
            editor.planFor(params);
        } else {
            editor.createFor(params);
        }
    }

    // ------------------------------------------------------------------------
    // Selection of sub-columns (R4, R5, R8)
    // ------------------------------------------------------------------------

    /** The press on a cell: a selection may follow (mouse: after 10 px, touch: after a long press). */
    onGridPointerDown() {
        // any press: the click of an earlier release had its chance
        this._selecting.resetClick();
        this._drag.resetClick();
    }

    onCellPointerDown(ev, cell, descriptor) {
        this._selecting.resetClick();
        const { archInfo, editor } = this.props;
        if (
            ev.button !== 0 ||
            !editor ||
            !archInfo.canCellCreate ||
            this.data.isSample ||
            descriptor.kind !== "pills" ||
            cell.column === undefined
        ) {
            return;
        }
        this._rowEl = ev.currentTarget.closest(".o_tl_row");
        this._rowId = descriptor.row.id;
        this._selecting.press(ev, descriptor);
    }

    /**
     * The sub-column of the pressed row under the viewport coordinate `x`. Folded columns are
     * skipped: the nearest open sub-column, away from the part `anchor` where the selection
     * started. Beyond the first or last column the first or last sub-column.
     */
    _partAt(x, anchor) {
        const rtl = this._isRtl();
        const parts = this.data.parts;
        if (!this._rowEl.isConnected) {
            // a re-render replaced the row element: find it again by its id
            this._rowEl =
                [...this.rendererRef().querySelectorAll(".o_tl_row")].find(
                    (element) => element.dataset.rowId === this._rowId
                ) || this._rowEl;
        }
        const items = [...this._rowEl.querySelectorAll(".o_tl_cell")].map((element) => ({
            rect: element.getBoundingClientRect(),
            column: element.dataset.column === undefined ? null : Number(element.dataset.column),
            run: element.dataset.run === undefined ? null : Number(element.dataset.run),
        }));
        const open = items.filter((item) => item.column !== null);
        if (!open.length) {
            return null;
        }
        const first = (item) => item.column * parts;
        const last = (item) => item.column * parts + parts - 1;
        const head = items[0].rect;
        const tail = items.at(-1).rect;
        if (rtl ? x >= head.right : x < head.left) {
            return first(open[0]);
        }
        if (rtl ? x < tail.left : x >= tail.right) {
            return last(open.at(-1));
        }
        const hit = items.find((item) => x >= item.rect.left && x < item.rect.right);
        if (!hit) {
            return null;
        }
        if (hit.column !== null) {
            const width = hit.rect.width || 1;
            const fraction = (rtl ? hit.rect.right - x : x - hit.rect.left) / width;
            return first(hit) + Math.min(Math.max(Math.floor(fraction * parts), 0), parts - 1);
        }
        const forward = anchor === null || hit.run > Math.floor(anchor / parts);
        const after = open.find((item) => item.column > hit.run);
        const before = open.findLast((item) => item.column < hit.run);
        const ahead = after ? first(after) : null;
        const behind = before ? last(before) : null;
        return forward ? (ahead ?? behind) : (behind ?? ahead);
    }

    _setSelection(selection) {
        if (!selection) {
            this.state.selection = null;
            return;
        }
        const current = this.state.selection;
        const rowId = selection.row.row.id;
        if (
            current &&
            current.rowId === rowId &&
            current.from === selection.from &&
            current.to === selection.to
        ) {
            return;
        }
        this.state.selection = { rowId, row: selection.row.row, from: selection.from, to: selection.to };
    }

    /** The release: create for the period; the highlight stays until the dialog has closed (R4). */
    _commitSelection(selection) {
        this._setSelection(selection);
        const shown = this.state.selection;
        // the badges belong to the drawing: once released, only the highlight stays (S2)
        shown.released = true;
        const clear = () => {
            if (this.state.selection === shown) {
                this.state.selection = null;
            }
        };
        const period = partPeriod(this.data, selection.from, selection.to);
        const promise = this.props.editor.createFor({ period, row: selection.row.row });
        promise.then(clear, (error) => {
            clear();
            throw error;
        });
    }

    /** While a selection is held, the view root changes the pointer and shields the buttons (R8). */
    _hold(on) {
        const root = this.rendererRef()?.closest(".o_timeline_view");
        if (root) {
            root.classList.toggle("o_tl_selecting", on);
        }
    }

    /** Style of the highlight in the row `descriptor`, or null when the selection is elsewhere. */
    selectionStyleOf(descriptor) {
        const selection = this.state.selection;
        if (!selection || selection.rowId !== descriptor.row.id) {
            return null;
        }
        return this._overlayStyle(selection.from, selection.to + 1);
    }

    /** The span of sub-columns `[from, to)` over the pills layer, for a highlight. */
    _overlayStyle(from, to) {
        const start = this._boundary(from);
        const stop = this._boundary(to);
        return `inset-inline-start: calc(${start}); width: calc(${stop} - ${start})`;
    }

    /** Offset of the boundary before sub-column `part` along the pills layer (folded columns count). */
    _boundary(part) {
        const data = this.data;
        const fold = this._fold;
        const parts = data.parts;
        const total = data.columns.length * parts;
        const units = total - fold.foldedColumns * parts;
        if (!fold.foldedColumns || units <= 0) {
            return `${(part / total) * 100}%`;
        }
        const column = Math.min(Math.floor(part / parts), data.columns.length);
        const before = part - fold.foldedBefore[column] * parts;
        const rest = `(100% - ${fold.foldedWidth}px)`;
        return `(${rest} * ${before / units} + ${fold.runsBefore[column] * FOLDED_WIDTH}px)`;
    }

    /**
     * The two badges now shown, `{start, stop}` each `{text, className}`: the bounds of the
     * selection (R5), or of the moved pill (R6); null when there is none.
     */
    get shownBadges() {
        const drag = this.state.drag;
        if (drag) {
            if (!drag.badges) {
                return null;
            }
            const classOf = (role) => (role === "black" ? "" : `text-${role}`);
            return {
                start: { text: drag.badges.start.text, className: classOf(drag.badges.start.role) },
                stop: { text: drag.badges.stop.text, className: classOf(drag.badges.stop.role) },
            };
        }
        const selection = this.state.selection;
        if (!selection || selection.released) {
            return null;
        }
        const data = this.data;
        const { start, stop } = partPeriod(data, selection.from, selection.to);
        return {
            start: { text: badgeText(start, data.scaleId, data.parts), className: "" },
            stop: { text: badgeText(stop, data.scaleId, data.parts), className: "" },
        };
    }

    onScroll() {
        if (this._drawing) {
            // the moved pill stays under the pointer, and the target changes with the grid
            this._drag.refresh();
        }
        this._placeBadges();
    }

    /**
     * R5: the start badge ends at the top of the selection, its start edge at the one of the
     * selection but never over the row header; the stop badge starts at the bottom of the
     * selection, its end edge at the one of the selection; right-to-left swaps the sides.
     */
    _placeBadges() {
        const drag = this.state.drag;
        const selector = drag ? ".o_tl_pill_moved" : this.state.selection && ".o_tl_selection";
        const element = selector && this.rendererRef()?.querySelector(selector);
        if (!element) {
            return;
        }
        const grid = element.closest(".o_tl_grid");
        const startBadge = grid.querySelector(".o_tl_badge_start");
        const stopBadge = grid.querySelector(".o_tl_badge_stop");
        if (!startBadge || !stopBadge) {
            return;
        }
        const header = drag
            ? grid.querySelector(".o_tl_title_cell")
            : element.closest(".o_tl_row").querySelector(".o_tl_row_header");
        const rtl = this._isRtl();
        placeBoundBadges(grid, element.getBoundingClientRect(), header, rtl, startBadge, stopBadge);
        if (drag && !rtl) {
            this._keepStopBadgeInside(grid, stopBadge, header);
        }
    }

    /**
     * R6: the stop badge of a moved pill stays at least 1 px inside the window's right edge, and
     * no further from that edge than the window's width minus the row header column's.
     */
    _keepStopBadgeInside(grid, badge, header) {
        const rect = badge.getBoundingClientRect();
        const least = header ? header.getBoundingClientRect().width : 0;
        const right = Math.min(Math.max(rect.right, least), window.innerWidth - 1);
        if (right !== rect.right) {
            badge.style.left = `${right - rect.width - grid.getBoundingClientRect().left}px`;
        }
    }

    /** A click on a folded header opens its run, on the header of an open foldable one folds it. */
    onColumnClick(column) {
        if (column.folded) {
            // R23: unfolding a column starts the click lock
            this._lockClicks(CELL_CLICK_LOCK, true);
            this._setRunOpen(column.run, true);
        } else if (column.run !== null) {
            this._setRunOpen(column.run, false);
        }
    }

    _setRunOpen(run, open) {
        this._clearRunHover();
        this._opened[open ? "add" : "delete"](this._runKey(run));
        this.state.version++;
    }

    /** An open run is remembered by the start of its first column, not by its position. */
    _runKey(first) {
        return this.data.columns[first].start.toISO();
    }

    /** The pointer over the header of an open foldable column marks its whole run (R29). */
    onColumnEnter(ev, column) {
        if (column.folded || column.run === null || this._drag.isActive) {
            return;
        }
        const grid = ev.currentTarget.closest(".o_tl_grid");
        grid.classList.add("o_tl_run_hovering");
        for (const header of grid.querySelectorAll(`.o_tl_col[data-run="${column.run}"]`)) {
            header.classList.add("o_tl_run_hover");
        }
    }

    onColumnLeave(ev) {
        this._clearRunHover(ev.currentTarget.closest(".o_tl_grid"));
    }

    _clearRunHover(grid) {
        for (const element of (grid ? [grid] : document.querySelectorAll(".o_tl_run_hovering"))) {
            element.classList.remove("o_tl_run_hovering");
            for (const header of element.querySelectorAll(".o_tl_run_hover")) {
                header.classList.remove("o_tl_run_hover");
            }
        }
    }

    /** The pointer marks a group row or a total bar with a class (R26, R40). */
    onPointerEnter(ev) {
        if (this._drag.isActive) {
            return; // the hover effects pause while a pill is held (R2)
        }
        ev.currentTarget.classList.add("o_tl_hover");
    }

    onPointerLeave(ev) {
        ev.currentTarget.classList.remove("o_tl_hover");
    }

    // ------------------------------------------------------------------------
    // Moving and copying a pill (R1 to R7, R9)
    // ------------------------------------------------------------------------

    /** R1: a pill moves when the view edits, drag and drop is on, and it is not cut. */
    _pillState(pill) {
        const { archInfo, editor } = this.props;
        const { cutStart, cutStop } = pill.record.span;
        const movable =
            Boolean(editor) &&
            !this.data.isSample &&
            archInfo.canEdit &&
            !archInfo.disableDragDrop &&
            !cutStart &&
            !cutStop;
        return { movable, resizable: { start: false, stop: false } };
    }

    /** The press on a pill (R2): a move may follow. `row` is the row descriptor of the pill. */
    onPillPointerDown(ev, pill, row) {
        if (ev.button !== 0 || this.data.isSample) {
            return;
        }
        const element = ev.currentTarget;
        const grid = element.closest(".o_tl_grid").getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const renderer = this.rendererRef();
        this._pressed = {
            scroll: { left: renderer.scrollLeft, top: renderer.scrollTop },
            ghost: {
                label: pill.label,
                className: pill.className,
                progress: pill.progress,
                mark: pill.mark,
                left: rect.left - grid.left,
                top: rect.top - grid.top,
                width: rect.width,
                height: rect.height,
            },
        };
        this._drag.press(ev, pill, { rowId: row.row.id });
    }

    /** The view root takes the pointer shape of the gesture and shields the buttons (R2, M13). */
    _holdDrag(mode) {
        const root = this.rendererRef()?.closest(".o_timeline_view");
        if (root) {
            for (const name of [...root.classList]) {
                if (name.startsWith("o_tl_drag_")) {
                    root.classList.remove(name);
                }
            }
            root.classList.toggle("o_tl_dragging", Boolean(mode));
            if (mode) {
                root.classList.add(`o_tl_drag_${mode.split("-")[0]}`);
            }
        }
        if (mode && !this._dragMode) {
            // the gesture starts: the popover closes
            this._cancelPopover();
            this.popover.close();
        }
        this._dragMode = mode;
    }

    /** The cells of the row element `rowEl` and the one under `x`: `{part}`, "folded" or null. */
    _cellPart(rowEl, x) {
        const rtl = this._isRtl();
        const parts = this.data.parts;
        const items = [...rowEl.querySelectorAll(".o_tl_cell")].map((element) => ({
            rect: element.getBoundingClientRect(),
            column: element.dataset.column === undefined ? null : Number(element.dataset.column),
        }));
        const open = items.filter((item) => item.column !== null);
        if (!open.length) {
            return null;
        }
        const head = items[0].rect;
        const tail = items.at(-1).rect;
        if (rtl ? x >= head.right : x < head.left) {
            return { part: open[0].column * parts };
        }
        if (rtl ? x < tail.left : x >= tail.right) {
            return { part: open.at(-1).column * parts + parts - 1 };
        }
        const hit = items.find((item) => x >= item.rect.left && x < item.rect.right);
        if (!hit) {
            return null;
        }
        if (hit.column === null) {
            return "folded";
        }
        const fraction = (rtl ? hit.rect.right - x : x - hit.rect.left) / (hit.rect.width || 1);
        return { part: hit.column * parts + Math.min(Math.max(Math.floor(fraction * parts), 0), parts - 1) };
    }

    /**
     * R3, R13: the target of a pill held at the viewport point (x, y): the row under it and the
     * sub-column where the pill would start. See `TimelinePillDrag` for the answers.
     */
    _targetAt(x, y, grab) {
        const renderer = this.rendererRef();
        const { left, right } = this._visibleBounds();
        const box = renderer.getBoundingClientRect();
        if (x < left || x >= right || y >= box.top + renderer.clientHeight) {
            return null;
        }
        // the headers stay at the top of the area, the rows scroll under them
        let top = box.top;
        for (const header of renderer.querySelectorAll(".o_tl_col, .o_tl_col_group")) {
            top = Math.max(top, header.getBoundingClientRect().bottom);
        }
        if (y < top) {
            return null;
        }
        const rowEl = [...renderer.querySelectorAll(".o_tl_row[data-row-id]")].find((element) => {
            const rect = element.getBoundingClientRect();
            return y >= rect.top && y < rect.bottom;
        });
        if (!rowEl) {
            return null;
        }
        const rowId = rowEl.dataset.rowId;
        const hit = this._cellPart(rowEl, x);
        if (hit === "folded") {
            return undefined;
        }
        if (!hit) {
            return null;
        }
        if (!grab) {
            return { rowId, part: hit.part };
        }
        const data = this.data;
        const accepts = rowAcceptsDrop({
            rows: data.rows,
            rowId,
            startRowId: grab.rowId,
            groupBy: data.groupBy,
            fields: this.props.model.fields,
        });
        if (!accepts) {
            return null;
        }
        const total = data.columns.length * data.parts;
        const part = Math.min(Math.max(hit.part - grab.offset, 0), Math.max(total - grab.length, 0));
        return { rowId, part };
    }

    /** What is drawn while a pill is held (R3, R6): the moved pill, the highlight, the badges. */
    _setDrag(drawing) {
        this._drawing = drawing;
        if (!drawing) {
            this.state.drag = null;
            return;
        }
        const { pill, mode, target, rowId, offset } = drawing;
        const data = this.data;
        const record = pill.record;
        const length = record.span.to - record.span.from;
        let badges = null;
        if (target) {
            const n = target.part - record.span.from;
            const { placement } = data;
            const bounds = movedBounds(
                { start: record.start, stop: record.stop },
                n,
                dragStep(data, { dateOnly: hasDateOnlyBound(placement) }),
                placement
            );
            badges = dragBadges({
                start: bounds.start,
                stop: bounds.stop,
                kind: mode,
                n,
                data,
                dateOnlyStart: placement.startIsDate,
                dateOnlyStop: placement.stopIsDate,
            });
        }
        const renderer = this.rendererRef();
        const pressed = this._pressed;
        this.state.drag = {
            pillId: pill.id,
            mode,
            rowId: target ? target.rowId : null,
            startRowId: rowId,
            fromPart: record.span.from,
            toPart: target ? target.part : null,
            length,
            badges,
            // the pointer's way plus what the grid scrolled since the press: the pill is anchored
            // to the grid, the pointer to the window
            offset: {
                x: offset.x + renderer.scrollLeft - pressed.scroll.left,
                y: offset.y + renderer.scrollTop - pressed.scroll.top,
            },
            ghost: pressed.ghost,
        };
    }

    /**
     * The moved pill and the copy left behind (S1). Each is a box of the pill's span (the body
     * and one pixel around it: M1, M5) that carries the opacity, with the body one pixel inside
     * (M3). The box of the moved pill follows the pointer; the other stays at the press.
     */
    get dragGhost() {
        const drag = this.state.drag;
        if (!drag) {
            return null;
        }
        const { ghost, offset } = drag;
        const box = (left, top) =>
            `left: ${left - PILL_INSET}px; top: ${top - PILL_INSET}px;` +
            ` width: ${ghost.width + 2 * PILL_INSET}px; height: ${ghost.height + 2 * PILL_INSET}px`;
        return {
            ...ghost,
            movedStyle: box(ghost.left + offset.x, ghost.top + offset.y),
            originStyle: box(ghost.left, ghost.top),
        };
    }

    /** The class of a pill: the pill being held leaves a faded copy where it was (S1). */
    pillClass(pill) {
        return this.state.drag?.pillId === pill.id
            ? `${pill.className} o_tl_pill_origin`
            : pill.className;
    }

    /** Style of the drop highlight in the row `descriptor`, or null when the target is elsewhere. */
    dropStyleOf(descriptor) {
        const drag = this.state.drag;
        if (!drag || drag.toPart === null || drag.rowId !== descriptor.row.id) {
            return null;
        }
        return this._overlayStyle(drag.toPart, drag.toPart + drag.length);
    }

    /**
     * The release (R4, R5, R7): a move writes the new dates and row values, a copy duplicates the
     * record with them; nothing happens without a target. The values come from the record read at
     * the press, not from what a reload brought since (R15). A refusal is the caller's: the
     * returned promise rejects with the server error.
     */
    _commitDrag({ mode, pill, rowId, target }) {
        if (!target) {
            return undefined;
        }
        const { model, editor } = this.props;
        const data = this.data;
        const { placement } = data;
        const fields = model.fields;
        const record = pill.record;
        const n = target.part - record.span.from;
        const bounds = movedBounds(
            { start: record.start, stop: record.stop },
            n,
            dragStep(data, { dateOnly: hasDateOnlyBound(placement) }),
            placement
        );
        const targetChain = rowValueChain(data.rows, target.rowId, fields);
        let change;
        if (mode === "copy") {
            change = {
                kind: "copy",
                resId: record.resId,
                values: copyDefaults({ bounds, targetChain, fields, placement }),
            };
        } else {
            change = {
                kind: "move",
                resId: record.resId,
                values: moveWriteValues({ record, bounds, n, targetChain, fields, placement }),
                undo: {
                    values: undoValues({
                        kind: "move",
                        record,
                        fromChain: rowValueChain(data.rows, rowId, fields),
                        fields,
                        placement,
                    }),
                },
            };
        }
        // a closed group row that received the record opens once the server accepted (R5, R7, R15)
        return editor.applyChange(change).then((done) => {
            const row = done && model.data.visibleRows.find((item) => item.id === target.rowId);
            if (row?.isGroup && row.collapsed) {
                model.toggleRow(row.id);
            }
            return done;
        });
    }

    // ------------------------------------------------------------------------
    // Layout
    // ------------------------------------------------------------------------

    /** Everything the template reads, rebuilt only when the model published new data. */
    get layout() {
        const data = this.data;
        const small = this.ui.isSmall;
        const version = this.state.version;
        if (
            this._cache.data !== data ||
            this._cache.small !== small ||
            this._cache.version !== version
        ) {
            const key = [data.scaleId, data.range.kind, data.range.start, data.range.stop].join("|");
            if (key !== this._openedKey) {
                this._openedKey = key;
                this._opened.clear();
            }
            this._cache = { data, small, version, layout: this._buildLayout(data) };
        }
        return this._cache.layout;
    }

    _buildLayout(data) {
        const hasRowHeaders = data.groupBy.length > 0 || data.displayMode === "sparse";
        const offset = hasRowHeaders ? 2 : 1;
        // no available width: the answer is the minimum width a column may take
        const availableWidth = 0;
        const { width: minWidth } = columnWidth(
            data.scaleId,
            data.columns.length,
            data.parts,
            availableWidth
        );
        const unavailable = this._unavailableMaps(data);
        const fold = (this._fold = this._buildFold(data, unavailable, offset, minWidth));
        const track = fold.tracks.join(" ");
        return {
            hasRowHeaders,
            isSample: data.isSample,
            template: hasRowHeaders ? `var(--o-tl-row-header-width) ${track}` : track,
            columns: fold.headers.map((header) => this._columnView(header)),
            groups: data.columnGroups
                .map((group, index) => this._groupView(group, fold, index))
                .filter(Boolean),
            rows: this._buildRows(data, unavailable, fold),
            total: this.props.archInfo.totalRow ? this._buildTotal(data, fold) : null,
            totalParts: data.columns.length * data.parts,
        };
    }

    // ------------------------------------------------------------------------
    // Unavailable periods and folded columns (R28, R29)
    // ------------------------------------------------------------------------

    /**
     * The unavailable parts of every non-group row that belongs to a value of the last grouping
     * field: `Map<rowId, Map<columnIndex, boolean[]>>`. Rows of the empty value get nothing.
     */
    _unavailableMaps(data) {
        const maps = new Map();
        const field = data.unavailabilityField;
        if (!field) {
            return maps;
        }
        const visit = (rows, owner) => {
            for (const row of rows) {
                const own = row.fieldName === field ? row.resId : owner;
                if (!row.isGroup && own !== null && own !== undefined) {
                    maps.set(
                        row.id,
                        unavailableParts(data.unavailability[field]?.[own] || [], data.columns, data.parts)
                    );
                }
                visit(row.children, own);
            }
        };
        visit(data.rows, null);
        return maps;
    }

    /**
     * Which columns fold, and everything that follows from it: the grid tracks, the grid column of
     * every column, the headers, the cells of a row without unavailable parts and the position
     * of the sub-columns over the pills layer.
     */
    _buildFold(data, unavailable, offset, minWidth) {
        const count = data.columns.length;
        const runs = foldableRuns({
            columns: data.columns,
            rowsUnavailable: [...unavailable.values()],
            pillsSubRanges: data.records.map((record) => ({
                from: record.span.from,
                to: record.span.to,
            })),
            scaleId: data.scaleId,
            parts: data.parts,
        });
        // an open run that is no longer a foldable run is forgotten
        const keys = new Set(runs.map((run) => this._runKey(run.first)));
        for (const key of [...this._opened]) {
            if (!keys.has(key)) {
                this._opened.delete(key);
            }
        }
        const runOf = new Map();
        for (const run of runs) {
            run.open = this._opened.has(this._runKey(run.first));
            for (let index = run.first; index <= run.last; index++) {
                runOf.set(index, run);
            }
        }
        const foldedRun = (index) => {
            const run = runOf.get(index);
            return run && !run.open ? run : null;
        };
        const everyFolded = count > 0 && data.columns.every((_column, index) => foldedRun(index));
        const tracks = [];
        const headers = [];
        const gridColumn = [];
        const foldedBefore = [0]; // folded columns before each index (one more entry: all)
        const runsBefore = [0];
        data.columns.forEach((_column, index) => {
            const run = foldedRun(index);
            const isFirst = run && run.first === index;
            if (!run || isFirst) {
                tracks.push(
                    run
                        ? everyFolded
                            ? `minmax(${FOLDED_WIDTH}px, 1fr)`
                            : `${FOLDED_WIDTH}px`
                        : `minmax(${minWidth}px, 1fr)`
                );
            }
            gridColumn.push(offset + tracks.length - 1);
            if (!run) {
                headers.push({ index, column: data.columns[index], run: runOf.get(index)?.first ?? null });
            } else if (isFirst) {
                headers.push({ index, folded: true, run: run.first });
            }
            foldedBefore.push(foldedBefore[index] + (run ? 1 : 0));
            runsBefore.push(runsBefore[index] + (isFirst ? 1 : 0));
        });
        const foldedRuns = foldedBefore[count] ? runsBefore[count] : 0;
        const cellOf = (index, map) => {
            const run = foldedRun(index);
            if (run) {
                return index === run.first
                    ? {
                          key: `fold-${index}`,
                          className: "o_tl_folded_cell",
                          style: null,
                          run: run.first,
                      }
                    : null;
            }
            return this._cellOf(index, data, map?.get(index));
        };
        const cellsFor = (map) =>
            data.columns.map((_column, index) => cellOf(index, map)).filter(Boolean);
        return {
            tracks,
            headers: headers.map((header) => ({ ...header, gridColumn: gridColumn[header.index] })),
            gridColumn,
            everyFolded,
            foldedRun,
            plainCells: cellsFor(null),
            cellsFor,
            foldedBefore,
            runsBefore,
            foldedColumns: foldedBefore[count],
            foldedWidth: foldedRuns * FOLDED_WIDTH,
        };
    }

    /** One cell of a row: the today class, and the grey of the unavailable parts (R28). */
    _cellOf(index, data, covered) {
        const classes = [];
        if (data.columns[index].isToday) {
            classes.push("o_tl_is_today");
        }
        let style = null;
        if (covered && covered.every(Boolean)) {
            classes.push("o_tl_unavailable");
        } else if (covered) {
            // hard edges: each part is either grey or transparent
            const stops = covered.map((grey, part) => {
                const colour = grey ? "var(--o-tl-unavailable-bg)" : "transparent";
                return `${colour} ${(part / covered.length) * 100}% ${((part + 1) / covered.length) * 100}%`;
            });
            const side = getComputedStyle(document.documentElement).direction === "rtl" ? "left" : "right";
            style = `background-image: linear-gradient(to ${side}, ${stops.join(", ")})`;
        }
        return { key: index, column: index, className: classes.join(" "), style };
    }

    _columnView(header) {
        if (header.folded) {
            return {
                key: `fold-${header.index}`,
                index: header.index,
                folded: true,
                run: header.run,
                tooltip: _t("Show the folded days").toString(),
                style: `grid-column: ${header.gridColumn}`,
            };
        }
        const { column, index } = header;
        const scaleId = this.data.scaleId;
        const start = column.start;
        let label;
        let meridiem = "";
        let title;
        switch (scaleId) {
            case "day":
                if (is24HourFormat()) {
                    label = start.toFormat("H");
                } else {
                    label = start.toFormat("h");
                    meridiem = start.toFormat("a").toLowerCase();
                }
                title = `${textOfDate(start)}, ${start.toLocaleString({
                    hour: "numeric",
                    minute: "2-digit",
                    hourCycle: is24HourFormat() ? "h23" : "h12",
                })}`;
                break;
            case "week":
                label = start.toFormat("cccc d");
                title = textOfDate(start);
                break;
            case "month":
                label = start.toFormat("dd");
                title = textOfDate(start);
                break;
            default:
                label = start.toLocaleString({ month: this.ui.isSmall ? "short" : "long" });
                title = start.toLocaleString({ month: "long", year: "numeric" });
        }
        return {
            key: index,
            index,
            label,
            meridiem,
            title,
            date: start.toISODate(),
            isToday: column.isToday,
            run: header.run,
            style: `grid-column: ${header.gridColumn}`,
        };
    }

    /**
     * A group header spans the tracks of its columns. A folded run that crosses into the next group
     * is one track that belongs to the group of the run's first column: that header ends there
     * (its text is cut short) and the next one starts after the fold. A first group whose only
     * track is a fold shows no text (its full text stays in the tooltip).
     */
    _groupView(group, fold, index) {
        let label = group.label;
        if (this.ui.isSmall && this.data.scaleId === "month") {
            label = group.start.toLocaleString({ month: "short", year: "numeric" });
        }
        const firstColumn = group.firstColumn;
        const lastColumn = firstColumn + group.span - 1;
        const startRun = fold.foldedRun(firstColumn);
        // the first column lies in a fold begun in the previous group: the track is not ours
        const first = fold.gridColumn[firstColumn] + (startRun && startRun.first < firstColumn ? 1 : 0);
        const last = fold.gridColumn[lastColumn];
        if (first > last) {
            return null;
        }
        const sliver =
            index === 0 && !fold.everyFolded && first === last && fold.foldedRun(firstColumn);
        return {
            label: sliver ? "" : label,
            title: group.tooltip,
            style: `grid-column: ${first} / span ${last - first + 1}`,
        };
    }

    /**
     * Position of the sub-column range `[from, to)` over the pills layer, as inline style. Folded
     * columns have a fixed width, the others share what is left; no range crosses a folded column.
     */
    _spanStyle(from, to, data, inset = 0) {
        const total = data.columns.length * data.parts;
        const fold = this._fold;
        const units = total - fold.foldedColumns * data.parts;
        if (!fold.foldedColumns || units <= 0) {
            const start = `${(from / total) * 100}%`;
            const width = `${((to - from) / total) * 100}%`;
            return inset
                ? `inset-inline-start: calc(${start} + ${inset}px); width: calc(${width} - ${2 * inset}px)`
                : `inset-inline-start: ${start}; width: ${width}`;
        }
        const column = Math.min(Math.floor(from / data.parts), data.columns.length);
        const before = from - fold.foldedBefore[column] * data.parts;
        const rest = `(100% - ${fold.foldedWidth}px)`;
        const left = `calc(${rest} * ${before / units} + ${fold.runsBefore[column] * FOLDED_WIDTH + inset}px)`;
        return `inset-inline-start: ${left}; width: calc(${rest} * ${(to - from) / units} - ${2 * inset}px)`;
    }

    /** The total row: a bar for every segment where records run, over all records shown. */
    _buildTotal(data, fold) {
        const height = rowHeightFor(1);
        const spans = data.records.map((record) => ({ from: record.span.from, to: record.span.to }));
        const bars = totalBars(segmentCounts(spans), height).map((bar) => ({
            key: bar.from,
            count: bar.count,
            style: `${this._spanStyle(bar.from, bar.to, data)}; height: ${bar.heightPx}px`,
        }));
        return { height, bars, cells: fold.plainCells };
    }

    /** One descriptor per visible row. */
    _buildRows(data, unavailable, fold) {
        return data.visibleRows.map((row) => {
            const cells = unavailable.has(row.id) ? fold.cellsFor(unavailable.get(row.id)) : fold.plainCells;
            const progress = this._progressOf(row, data);
            if (row.isGroup) {
                return {
                    kind: "group",
                    key: row.id,
                    row,
                    height: GROUP_ROW_HEIGHT,
                    cells,
                    progress,
                    pills: [],
                    counts: segmentCounts(this._pillsOfRow(row, data)).map((segment) => ({
                        key: segment.from,
                        count: segment.count,
                        style: this._spanStyle(segment.from, segment.to, data),
                    })),
                };
            }
            const pills = stackPills(this._pillsOfRow(row, data));
            const lines = pills.reduce((most, pill) => Math.max(most, pill.line), 0);
            return {
                kind: "pills",
                key: row.id,
                row,
                height: rowHeightFor(lines),
                cells,
                progress,
                pills: pills.map((pill) => this.pillOf(pill.record, pill.line)),
            };
        });
    }

    /** R27: the capacity of a row header, from the answer of the server for its value. */
    _progressOf(row, data) {
        const entry =
            row.fieldName && row.resId !== null && row.resId !== undefined
                ? data.progress[row.fieldName]?.[row.resId]
                : null;
        if (!entry) {
            return null;
        }
        const value = Number(entry.value) || 0;
        const maximum = Number(entry.max_value) || 0;
        const hasBar = maximum > 0;
        const tooltip = hasBar
            ? `${formatHours(value)}/${formatHours(maximum)} (${Math.round((value / maximum) * 100)}%)`
            : null;
        return {
            label: formatHours(maximum - value),
            over: hasBar && value > maximum,
            hasBar,
            fill: hasBar ? Math.min(value / maximum, 1) * 100 : 0,
            tooltip,
            warning: hasBar ? null : entry.warning || null,
        };
    }

    _pillsOfRow(row, data) {
        const pills = [];
        for (const id of row.recordIds) {
            const record = data.recordsById.get(id);
            if (record) {
                const { from, to } = record.span;
                pills.push({ record, from, to, start: record.start });
            }
        }
        return pills;
    }

    // ------------------------------------------------------------------------
    // Pills
    // ------------------------------------------------------------------------

    /** The description of one pill, placed on `line` (from 1). */
    pillOf(record, line) {
        const { archInfo, model } = this.props;
        const data = this.data;
        const { from, to, cutStart, cutStop } = record.span;
        const colorIndex = archInfo.colorField ? colorIndexOf(record.raw[archInfo.colorField]) : 0;
        const decorations = this._decorationsOf(record);
        const classes = [`o_tl_color_${colorIndex}`];
        if (decorations.includes("info")) {
            classes.push("o_tl_striped");
        }
        if (cutStart) {
            classes.push("o_tl_pill_cut_start");
        }
        if (cutStop) {
            classes.push("o_tl_pill_cut_stop");
        }
        let progress = 0;
        if (archInfo.progressField) {
            const value = Number(record.raw[archInfo.progressField]) || 0;
            progress = Math.min(Math.max(value, 0), 100);
        }
        return {
            key: record.id,
            id: record.id,
            record,
            label: pillLabel(record, record.displayName, {
                scaleId: data.scaleId,
                range: data.range,
                computed: archInfo.computedLabel,
                hasAllocatedHours: "allocated_hours" in model.fields,
            }),
            className: classes.join(" "),
            style:
                `${this._spanStyle(from, to, data, PILL_INSET)};` +
                ` top: ${LINE_GAP + (line - 1) * LINE_STEP}px`,
            progress,
            mark: DECORATION_ORDER.find((name) => decorations.includes(name)) || null,
        };
    }

    /** Names of the decorations whose condition holds for the record (R15). */
    _decorationsOf(record) {
        const conditions = this.props.archInfo.decorations;
        const names = DECORATION_ORDER.filter((name) => conditions[name]);
        if (!names.length) {
            return [];
        }
        const { uid, allowed_company_ids } = user.context;
        const evalContext = {
            context: user.context,
            uid: user.userId ?? uid,
            allowed_company_ids,
            current_company_id: user.activeCompany?.id,
        };
        for (const [name, value] of Object.entries(record.raw)) {
            evalContext[name] = value && typeof value === "object" && "id" in value ? value.id : value;
        }
        return names.filter((name) => {
            try {
                return Boolean(evaluateBooleanExpr(conditions[name], evalContext));
            } catch (error) {
                console.warn(`Gantt decoration "${name}" could not be evaluated:`, error);
                return false;
            }
        });
    }
}
