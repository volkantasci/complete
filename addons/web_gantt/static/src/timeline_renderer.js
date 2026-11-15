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
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
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
    pillSpan,
    positionOf,
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
    resizedBound,
    resizeIsInvalid,
    rowAcceptsDrop,
    serializeBound,
    undoValues,
} from "./timeline_drag_math";
import { TimelinePillDrag } from "./timeline_drag";
import { badgeText, columnPeriod, partPeriod, rowValueChain } from "./timeline_editing";
import {
    countPickedRecords,
    firstPickedBlock,
    isMultiSelectMode,
    pickedDaysByRow,
    TimelinePickedCells,
} from "./timeline_multi_select";
import { panelSpan } from "./timeline_panel_math";
import { POPOVER_DELAY, TimelinePopover } from "./timeline_popover";
import { TimelineSelection } from "./timeline_selection";
import { hasSidePanel, TimelineSidePanel } from "./timeline_side_panel";

const { DateTime } = luxon;

/** Decoration names in the order the corner mark picks one when several hold. */
const DECORATION_ORDER = ["danger", "warning", "success", "info", "secondary"];
/** Vertical space of one line of pills, and the gap above the first pill of a line. */
const LINE_STEP = 25;
// each side of a pill is one pixel inside its columns (the progress fill is 75 % of what is left)
const PILL_INSET = 1;
const LINE_GAP = 1;
const GROUP_ROW_HEIGHT = 40;
/** Distance from the top of the selection to the top of its start badge (R5). */
const BADGE_HEIGHT = 20;

/** Width of a folded column, in pixels (M45). */
const FOLDED_WIDTH = 36;
/** Clicks on cells are ignored this long after a click on a cell (R7: a double click opens one dialog). */
export const CELL_CLICK_LOCK = 1000;
/** ... and this long after the popover closes, unless a lock already runs (R7). */
export const POPOVER_CLOSE_LOCK = 250;

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
 *
 * The selection of several cells (002b3 R2 to R9, R15), on while `isMultiSelect`:
 * - `this.picked` is a reactive `TimelinePickedCells`: the picked cells and the two anchors. Its
 *   cells are drawn as `.o_tl_cell_picked` elements in each row's selection layer; while a
 *   drawing is held they are the cells of the rectangle (and of the earlier selection with Ctrl);
 * - reading for the buttons, the panel and the creation: `pickedCount` (the number of records
 *   whose pill covers a picked cell of a record row), `pickedRecordIds()`, `pickedDays()` (one
 *   entry per record row and day), `firstBlock()` (the New button's block), `partPeriod(from, to)`,
 *   `rowOf(rowId)` (`{row, values}`: the row and its grouping values chain, as 002b R6 builds
 *   them for a creation), and `clearPicked()`;
 * - the channel to the controller is the optional prop `selection`, an object `{state, renderer}`
 *   the controller owns: the renderer sets `selection.renderer` to itself while it is mounted and
 *   keeps the reactive `selection.state = {count, cellCount, drawing, visible}` up to date after
 *   every change (`visible`: cells are picked and no drawing is held, which is when the buttons
 *   show). The controller reads `state` in its template and calls the methods above on
 *   `selection.renderer`. Every reload (a new `records`, `columns` or list of visible rows
 *   published by the model) clears the selection through the model's update event.
 */
export class TimelineRenderer extends Component {
    static template = "web_gantt.TimelineRenderer";
    static components = { ActionHelper, TimelineSidePanel };
    props = useProps({
        model: t.object(),
        archInfo: t.object(),
        editor: t.object().optional(),
        noContentHelp: t.string().optional(),
        selection: t.object().optional(),
    });

    rendererRef = signal.ref();

    setup() {
        this.ui = useService("ui");
        this._cache = { data: null, small: null, version: null, layout: null };
        // folded columns: the runs the user opened, by the index of their first column; reset when
        // the range or the scale changes. `state.version` makes a change redraw the grid.
        this.state = proxy({ version: 0, selection: null, drag: null, hover: null });
        this._opened = new Set();
        this._openedKey = null;
        this._fold = null;
        this._popoverTimer = null;
        this._popoverFor = null;
        this._clickLock = null;
        this._pressCell = null;
        this._releaseCell = null;
        this._seenData = null;
        this._rowEl = null;
        this._pressCtrl = false;
        this._info = null;
        this.picked = proxy(
            new TimelinePickedCells({
                isFolded: (part) =>
                    Boolean(this._fold?.foldedRun(Math.floor(part / this.data.parts))),
            })
        );
        this._selecting = new TimelineSelection({
            partAt: (x, anchor) => this._partAt(x, anchor),
            edges: () => this._visibleBounds(),
            scrollBy: (dx, dy = 0) => {
                const renderer = this.rendererRef();
                const vertical = this._verticalScroller();
                const before = { left: renderer.scrollLeft, top: vertical.scrollTop };
                renderer.scrollLeft += dx;
                if (dy) {
                    vertical.scrollTop += dy;
                }
                return {
                    dx: renderer.scrollLeft - before.left,
                    dy: vertical.scrollTop - before.top,
                };
            },
            axes: () => (this.isMultiSelect ? "xy" : "x"),
            // only a drawing over several rows needs the row under the pointer
            rowAt: (y, rowId) => (this.isMultiSelect ? this._rowIdAt(y, rowId) : undefined),
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
                const vertical = this._verticalScroller();
                const before = { left: renderer.scrollLeft, top: vertical.scrollTop };
                const { maxLeft = Infinity, maxTop = Infinity } = this._gesture || {};
                // never past the end the grid had when the gesture began
                const reach = Math.max(maxLeft, Math.abs(before.left));
                const [low, high] = this._isRtl() ? [-reach, 0] : [0, reach];
                renderer.scrollLeft = Math.min(Math.max(before.left + dx, low), high);
                vertical.scrollTop = Math.min(before.top + dy, Math.max(maxTop, before.top));
                return {
                    dx: renderer.scrollLeft - before.left,
                    dy: vertical.scrollTop - before.top,
                };
            },
            change: (drawing) => this._setDrag(drawing),
            commit: (result) => this._commitDrag(result),
            borderAt: (x, pill, edge) => this._borderAt(x, pill, edge),
            hold: (mode) => this._holdDrag(mode),
            panelOpen: () => this.hasPanel && this.panel.open,
        });
        // where the pressed pill stood (grid coordinates) and how far the grid had scrolled
        this._pressed = null;
        this._drawing = null;
        this._dragMode = null;
        this._gesture = null;
        this.popover = usePopover(TimelinePopover, {
            position: "bottom",
            // the popover hangs from the box of the pill, one pixel around its body (the lane of
            // a pill starts one pixel above the body: M5 of 002b2): below it, as far from the
            // body as before; above it, two pixels higher than before (the body is one higher
            // and the box's top one more)
            onPositioned: (element, { direction }) => {
                const shift = { bottom: PILL_INSET, top: -PILL_INSET }[direction];
                if (shift) {
                    element.style.top = `${parseFloat(element.style.top) + shift}px`;
                }
            },
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
        // every reload clears the picked cells and their anchors (R9): the cells name rows and
        // parts of the data that was shown
        this._stampData();
        const onUpdate = () => this._dropStalePicked();
        model.bus.addEventListener("update", onUpdate);
        const link = this.props.selection;
        if (link) {
            link.renderer = this;
        }
        // Escape while cells are picked and no drawing is held clears them (R9); during a
        // drawing the selection's own key handler takes it
        useHotkey("escape", () => this.clearPicked(), {
            isAvailable: () => this.isMultiSelect && !this.picked.isEmpty && !this.picked.isDrawing,
        });
        onMounted(() => this._syncScroll());
        onPatched(() => {
            this._syncScroll();
            this._placeBadges();
        });
        onWillUnmount(() => {
            model.bus.removeEventListener("update", onUpdate);
            if (link && link.renderer === this) {
                link.renderer = null;
                Object.assign(link.state, { count: 0, cellCount: 0, drawing: false, visible: false });
            }
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
        // the scrolling area is the whole grid box, its sticky header rows included: the top zone
        // lies over the column headers (R14, A53)
        const scroller = this._verticalScroller();
        const area = scroller.getBoundingClientRect();
        const top = Math.max(box.top + element.clientTop, area.top + scroller.clientTop, 0);
        // a page that scrolls the rows ends at the window, a grid's own area at its own edge
        const end = area.top + scroller.clientTop + scroller.clientHeight;
        const bottom = scroller === element ? end : Math.min(end, window.innerHeight);
        return { left, right, top, bottom };
    }

    /**
     * The element that scrolls the rows: the grid's area when its rows overflow it; on the
     * small-screen layout, where the grid only scrolls sideways, the nearest ancestor that
     * scrolls the page (R14, R32 of 002a). On a desktop an ancestor is never scrolled. Found
     * once per gesture.
     */
    _verticalScroller() {
        if (this._gesture) {
            return this._gesture.scroller;
        }
        const element = this.rendererRef();
        if (element.scrollHeight > element.clientHeight || !this.ui.isSmall) {
            return element;
        }
        for (let node = element.parentElement; node; node = node.parentElement) {
            const overflow = getComputedStyle(node).overflowY;
            if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
                return node;
            }
        }
        return element;
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

    /**
     * A click on the header of a row that is not a group scrolls to its first pill's column (R39);
     * in multi-selection mode it then selects the row over the whole range (R7). A group row's
     * header only opens or closes the group (the row's own click).
     */
    onRowHeaderClick(descriptor, ev) {
        if (descriptor.kind !== "pills") {
            return;
        }
        this._scrollToFirstPill(descriptor);
        if (this.isMultiSelect && !this.data.isSample && ev) {
            const total = this.data.columns.length * this.data.parts;
            this.picked.clickRowHeader(
                descriptor.row.id,
                this._modifiers(ev),
                this._pickInfo().rowOrder,
                Array.from({ length: total }, (_, part) => part)
            );
            this._publishPicked();
        }
    }

    _scrollToFirstPill(descriptor) {
        if (!descriptor.pills.length) {
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

    /** Ctrl (or Meta) and Shift of a pointer event: the modifiers of the selection (R4 to R7). */
    _modifiers(ev) {
        return { ctrl: Boolean(ev.ctrlKey || ev.metaKey), shift: Boolean(ev.shiftKey) };
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
        if (this._selecting.consumeClick()) {
            // the release of a drawing that began on a locked pill is no click on it (R5)
            ev.stopPropagation();
            return;
        }
        if (this._drag.consumeClick(ev.detail) || (this._drag.justReleased && ev.detail > 1)) {
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

    /** The side panel stands beside the grid box (002b3 R17, R18), open or closed. */
    get hasPanel() {
        return hasSidePanel({
            archInfo: this.props.archInfo,
            isSmall: this.ui.isSmall,
            isSample: this.data.isSample,
        });
    }

    get panel() {
        return this.props.model.panel;
    }

    /**
     * 002b3 R22: the drop zone replaces the panel's content while a pill is moved or copied and
     * the panel is open; a resize, a locked pill and a line of the panel never show it.
     */
    get showsDropZone() {
        const mode = this.state.drag?.mode;
        return this.hasPanel && this.panel.open && (mode === "move" || mode === "copy");
    }

    /**
     * Whether the pointer of the drawing `drawing` is over the drop zone (R22): the zone when it
     * is drawn, the panel's box before (the first drawing of a move comes before the zone is).
     */
    _overDropZone(drawing) {
        const element =
            document.querySelector(".o_tl_panel_dropzone") || document.querySelector(".o_tl_panel");
        if (!element || !this.panel.open) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        return (
            drawing.x >= rect.left &&
            drawing.x < rect.right &&
            drawing.y >= rect.top &&
            drawing.y < rect.bottom
        );
    }

    get data() {
        return this.props.model.data;
    }

    /**
     * The cell of a group row an event happened in: the column (or folded run) of a cell, the
     * header, or the bare row; with the row, so a release in another row never matches.
     */
    _groupCellKey(ev, descriptor) {
        const target = ev.target;
        const cell = target.closest?.(".o_tl_cell");
        let part = "row";
        if (cell) {
            part = cell.dataset.column !== undefined ? `c${cell.dataset.column}` : `r${cell.dataset.run}`;
        } else if (target.closest?.(".o_tl_row_header")) {
            part = "header";
        }
        return `${descriptor.row.id}:${part}`;
    }

    /** R1, D7: the press and the release on a group row are remembered, cell by cell. */
    onRowPointerDown(ev, descriptor) {
        this._pressCell = descriptor.kind === "group" ? this._groupCellKey(ev, descriptor) : null;
        this._releaseCell = null;
    }

    onRowPointerUp(ev, descriptor) {
        this._releaseCell = descriptor.kind === "group" ? this._groupCellKey(ev, descriptor) : null;
    }

    /**
     * A click on a group row (its header or a cell) folds or opens it (R22), only when the press
     * and the release fell in the same cell of the row, whatever the pointer moved in between
     * (R1, D7). Without a remembered press (a click without its pointer events) it toggles.
     */
    onRowClick(descriptor) {
        const press = this._pressCell;
        const release = this._releaseCell;
        this._pressCell = this._releaseCell = null;
        if (descriptor.kind !== "group") {
            return;
        }
        if (press && release && press !== release) {
            return;
        }
        this.props.model.toggleRow(descriptor.row.id);
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
        if (this.isMultiSelect && !this.data.isSample && descriptor) {
            this._clickCellMulti(ev, cell, descriptor);
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
                // in multi-selection mode a folded cell does nothing (R6): only a header opens it
                if (!this.isMultiSelect) {
                    this._setRunOpen(cell.run, true);
                }
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

    /**
     * R4: a click on a cell of a record row picks the sub-columns of its column, with no click
     * lock and no dialog; Ctrl toggles. A folded cell does nothing; a group row's cell only
     * toggles the group (the row's own click).
     */
    _clickCellMulti(ev, cell, descriptor) {
        if (descriptor.kind !== "pills") {
            return;
        }
        if (cell.run !== undefined) {
            ev.stopPropagation();
            return;
        }
        if (cell.column === undefined) {
            return;
        }
        this.picked.clickColumnOfRow(descriptor.row.id, this._partsOfColumn(cell.column), {
            ctrl: this._modifiers(ev).ctrl,
        });
        this._publishPicked();
    }

    // ------------------------------------------------------------------------
    // The picked cells (002b3 R2 to R9)
    // ------------------------------------------------------------------------

    /** R2: the cells of the view are picked, not created from. */
    get isMultiSelect() {
        return isMultiSelectMode({
            multiCreateView: this.props.archInfo.multiCreateView,
            isSmall: this.ui.isSmall,
            displayMode: this.data.displayMode,
            scale: this.data.scaleId,
        });
    }

    _partsOfColumn(index) {
        const parts = this.data.parts;
        return Array.from({ length: parts }, (_, k) => index * parts + k);
    }

    /** What the picked cells need from the published data, built once per publication. */
    _pickInfo() {
        const data = this.data;
        if (this._info?.data !== data) {
            const rowsById = {};
            for (const row of data.visibleRows) {
                rowsById[row.id] = row;
            }
            this._info = {
                data,
                rowsById,
                rowOrder: data.visibleRows.map((row) => row.id),
                pillParts: (rowId) =>
                    (rowsById[rowId]?.recordIds || [])
                        .map((id) => data.recordsById.get(id))
                        .filter(Boolean)
                        .map((record) => ({
                            resId: record.resId,
                            from: record.span.from,
                            // the span ends before sub-column `to`: the last one it covers
                            // is the one before (at least its first)
                            to: Math.max(record.span.from, record.span.to - 1),
                        })),
            };
        }
        return this._info;
    }

    /** The ids of the records whose pill covers a picked cell of a record row (R8). */
    pickedRecordIds() {
        const { rowsById, pillParts } = this._pickInfo();
        return [...countPickedRecords(this.picked.cells(), rowsById, pillParts)];
    }

    get pickedCount() {
        return this.pickedRecordIds().length;
    }

    /** One entry per record row and day with a picked sub-column (R11). */
    pickedDays() {
        const { rowsById, rowOrder } = this._pickInfo();
        return pickedDaysByRow(
            this.picked.cells(),
            rowsById,
            (part) => this._partTime(part).toISODate(),
            rowOrder
        );
    }

    /** The first block of the picked cells, for the New button (R12), or null. */
    firstBlock() {
        const { rowsById, rowOrder } = this._pickInfo();
        return firstPickedBlock(this.picked.cells(), rowOrder, rowsById);
    }

    /** The period of the sub-columns `fromPart` to `toPart`, both included. */
    partPeriod(fromPart, toPart) {
        return partPeriod(this.data, fromPart, toPart);
    }

    /** The row `rowId` and the values of its grouping fields and of its parents' (002b R6). */
    rowOf(rowId) {
        const row = this._pickInfo().rowsById[rowId];
        return row
            ? { row, values: rowValueChain(this.data.rows, rowId, this.props.model.fields) }
            : null;
    }

    /** Clear the cells, the anchors and a drawing (R9). */
    clearPicked() {
        this.picked.clear();
        this._publishPicked();
    }

    /** Tell the controller what is picked (see the class comment). */
    _publishPicked() {
        const link = this.props.selection;
        if (!link) {
            return;
        }
        const cellCount = this.picked.size;
        const drawing = this.picked.isDrawing;
        Object.assign(link.state, {
            count: cellCount ? this.pickedCount : 0,
            cellCount,
            drawing,
            visible: cellCount > 0 && !drawing,
        });
    }

    _stampData() {
        const data = this.data;
        this._stamp = {
            records: data.records,
            columns: data.columns,
            rows: data.visibleRows.map((row) => row.id).join("|"),
        };
    }

    /** The model published new data: a reload, a group opened or closed (R9). */
    _dropStalePicked() {
        const before = this._stamp;
        this._stampData();
        const now = this._stamp;
        if (
            before.records !== now.records ||
            before.columns !== now.columns ||
            before.rows !== now.rows
        ) {
            this.clearPicked();
        }
    }

    /** The cells to draw: the drawing's while one is held, else the picked ones, by row. */
    get pickedByRow() {
        const byRow = new Map();
        if (!this.isMultiSelect) {
            return byRow;
        }
        const cells = this.picked.isDrawing ? this.picked.drawnCells() : this.picked.cells();
        for (const { rowId, part } of cells) {
            if (!byRow.has(rowId)) {
                byRow.set(rowId, []);
            }
            byRow.get(rowId).push(part);
        }
        return byRow;
    }

    /** The style of the highlight of one picked sub-column. */
    pickedStyle(part) {
        return this._overlayStyle(part, part + 1);
    }

    /**
     * The row id under the viewport coordinate `y` for a drawing: the row at the pointer; over the
     * headers the first row shown under them, below the last one the last row (R5).
     */
    _rowIdAt(y, current) {
        const renderer = this.rendererRef();
        const rows = [...renderer.querySelectorAll(".o_tl_row[data-row-id]")].map((element) => ({
            id: element.dataset.rowId,
            rect: element.getBoundingClientRect(),
        }));
        if (!rows.length) {
            return current;
        }
        let top = renderer.getBoundingClientRect().top;
        for (const header of renderer.querySelectorAll(".o_tl_col, .o_tl_col_group")) {
            top = Math.max(top, header.getBoundingClientRect().bottom);
        }
        const bottom = this._visibleBounds().bottom;
        const at = Math.min(Math.max(y, top), Math.max(bottom - 1, top));
        const hit = rows.find((row) => at >= Math.max(row.rect.top, top) && at < row.rect.bottom);
        if (hit) {
            return hit.id;
        }
        return at >= rows.at(-1).rect.bottom ? rows.at(-1).id : rows[0].id;
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
        if (this.isMultiSelect) {
            // R5: a drawing from an empty part of a cell of a record row; a group row's cell
            // starts none
            if (
                ev.button === 0 &&
                !this.data.isSample &&
                descriptor.kind === "pills" &&
                cell.column !== undefined
            ) {
                this._pressDrawing(ev, ev.currentTarget.closest(".o_tl_row"), descriptor);
            }
            return;
        }
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

    /** The press that may start a drawing in the row element `rowEl` (R5). */
    _pressDrawing(ev, rowEl, descriptor) {
        this._pressCtrl = this._modifiers(ev).ctrl;
        this._rowEl = rowEl;
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
        if (this.isMultiSelect) {
            this._setDrawing(selection);
            return;
        }
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
        if (this.isMultiSelect) {
            // R5.2: the rectangle (and, with Ctrl, the earlier cells) becomes the selection
            this._setDrawing(selection);
            this.picked.endDrawing();
            this._publishPicked();
            return;
        }
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

    /**
     * R5: the cells of the rectangle from the pressed cell to the one under the pointer, over
     * every row between; null (Escape, a cancelled press) clears the whole selection.
     */
    _setDrawing(selection) {
        if (!selection) {
            this.picked.cancelDrawing();
            this._publishPicked();
            return;
        }
        if (!this.picked.isDrawing) {
            this.picked.startDrawing(selection.row.row.id, selection.startPart, {
                ctrl: this._pressCtrl,
            });
        }
        this.picked.drawTo(selection.rowId, selection.part, this._pickInfo().rowOrder);
        this._publishPicked();
    }

    /** While a selection is held, the view root changes the pointer and shields the buttons (R8). */
    _hold(on) {
        const root = this.rendererRef()?.closest(".o_timeline_view");
        if (root) {
            root.classList.toggle("o_tl_selecting", on);
            root.classList.toggle("o_tl_drawing", on && this.isMultiSelect);
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
        const selector = drag
            ? drag.resize
                ? ".o_tl_pill_resizing"
                : drag.mode === "panel"
                ? ".o_tl_drop"
                : ".o_tl_pill_moved"
            : this.state.selection && ".o_tl_selection";
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
        const rect = element.getBoundingClientRect();
        placeBoundBadges(grid, rect, header, rtl, startBadge, stopBadge);
        if (drag) {
            this._keepStopBadgeInside(grid, stopBadge, header, rtl);
        }
    }

    /**
     * R6: the stop badge of a moved pill stays at least 1 px inside the window's right edge, and
     * no further from that edge than the window's width minus the row header column's. Right to
     * left the rule is mirrored on the left edge.
     */
    _keepStopBadgeInside(grid, badge, header, rtl = false) {
        const rect = badge.getBoundingClientRect();
        const least = header ? header.getBoundingClientRect().width : 0;
        if (rtl) {
            // mirrored (ruling R-T17-1): the stop badge stands on the left, so its left edge is
            // kept at least 1 px inside the window's left edge and no further from it than the
            // window's width minus the row header column's
            const left = Math.min(Math.max(rect.left, 1), Math.max(window.innerWidth - least, 1));
            if (left !== rect.left) {
                badge.style.left = `${left - grid.getBoundingClientRect().left}px`;
            }
            return;
        }
        const right = Math.min(Math.max(rect.right, least), window.innerWidth - 1);
        if (right !== rect.right) {
            badge.style.left = `${right - rect.width - grid.getBoundingClientRect().left}px`;
        }
    }

    /**
     * A click on a folded header opens its run, on the header of an open foldable one folds it.
     * In multi-selection mode (R6) it selects the column in every row, and folding or opening
     * without Ctrl clears the selection; with Shift the column is selected without folding.
     */
    onColumnClick(column, ev) {
        if (this.isMultiSelect && !this.data.isSample && ev) {
            this._clickColumnMulti(column, this._modifiers(ev));
            return;
        }
        if (column.folded) {
            // R23: unfolding a column starts the click lock
            this._lockClicks(CELL_CLICK_LOCK, true);
            this._setRunOpen(column.run, true);
        } else if (column.run !== null) {
            this._setRunOpen(column.run, false);
        }
    }

    _clickColumnMulti(column, { ctrl, shift }) {
        const foldable = column.folded || column.run !== null;
        if (foldable && !shift && (column.folded || !ctrl)) {
            // R6: a plain click folds an open column and opens a folded one (with Ctrl a folded
            // one opens and is picked); doing it without Ctrl clears the selection
            const last = column.folded ? this._fold.foldedRun(column.run).last : column.run;
            if (!ctrl) {
                this.picked.clear();
            }
            if (column.folded) {
                // R23: unfolding a column starts the click lock
                this._lockClicks(CELL_CLICK_LOCK, true);
            }
            this._setRunOpen(column.run, column.folded);
            if (column.folded && ctrl) {
                // the cells of the run exist and can be picked once the layout shows it open
                this._refreshLayout();
                this.picked.clickColumnHeader(
                    column.run,
                    { ctrl, shift: false },
                    this._pickInfo().rowOrder,
                    (i) => this._partsOfColumns(i === column.run ? [column.run, last] : [i, i])
                );
            }
            this._publishPicked();
            return;
        }
        this.picked.clickColumnHeader(
            column.index,
            { ctrl, shift },
            this._pickInfo().rowOrder,
            (i) => this._partsOfColumns([i, i])
        );
        this._publishPicked();
    }

    /** The sub-columns of the columns `first` to `last` that exist. */
    _partsOfColumns([first, last]) {
        const parts = [];
        for (let i = Math.max(first, 0); i <= Math.min(last, this.data.columns.length - 1); i++) {
            parts.push(...this._partsOfColumn(i));
        }
        return parts;
    }

    /** Build the layout now: a change of the folded runs shows in it. */
    _refreshLayout() {
        return this.layout;
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
        const editable = Boolean(editor) && !this.data.isSample && archInfo.canEdit;
        const movable = editable && !archInfo.disableDragDrop && !cutStart && !cutStop;
        // R8: an end is resizable when it lies inside the range; the drag-and-drop option does
        // not matter
        return { movable, resizable: { start: editable && !cutStart, stop: editable && !cutStop } };
    }

    /** The pointer enters a pill: its handles show, unless a gesture is on (R8). */
    onPillEnter(pill, row) {
        if (!this.state.drag && this._drag.state === "idle") {
            this.state.hover = `${row.row.id}|${pill.id}`;
        }
    }

    onPillLeave() {
        this.state.hover = null;
    }

    /**
     * The resize handles drawn in `pill` (R8, S4): none unless the pointer rests on the pill and
     * nothing is held. Each handle sits at one end; the pointer shape is the west or east one
     * (in a mirrored grid the start is on the right).
     */
    handlesOf(pill, row) {
        if (this.state.hover !== `${row.row.id}|${pill.id}` || this.state.drag || this._drag.state !== "idle") {
            return [];
        }
        const { resizable } = this._pillState(pill);
        const rtl = this._isRtl();
        return ["start", "stop"]
            .filter((edge) => resizable[edge])
            .map((edge) => ({ edge, side: (edge === "start") !== rtl ? "west" : "east" }));
    }

    /** The press on a pill (R2): a move may follow. `row` is the row descriptor of the pill. */
    onPillPointerDown(ev, pill, row) {
        if (ev.button !== 0 || this.data.isSample) {
            return;
        }
        if (this.isMultiSelect && !this._holdsPill(ev, pill)) {
            // R5: a locked pill is no obstacle to a drawing, which starts at the cell under it
            this._pressDrawing(ev, ev.currentTarget.closest(".o_tl_row"), row);
            return;
        }
        const element = ev.currentTarget;
        const grid = element.closest(".o_tl_grid").getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const renderer = this.rendererRef();
        this._pressed = {
            scroll: { left: renderer.scrollLeft, top: this._verticalScroller().scrollTop },
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
        const handle = ev.target.closest?.(".o_tl_handle")?.dataset.edge || null;
        this._drag.press(ev, pill, { rowId: row.row.id, handle });
    }

    /** Whether a press on `pill` holds it: it moves, or a handle that can resize is pressed (R5). */
    _holdsPill(ev, pill) {
        const state = this._pillState(pill);
        const handle = ev.target.closest?.(".o_tl_handle")?.dataset.edge || null;
        return state.movable || Boolean(handle && ev.pointerType !== "touch" && state.resizable[handle]);
    }

    /** The view root takes the pointer shape of the gesture and shields the buttons (R2, M13). */
    _holdDrag(mode) {
        // what the edge scrolling needs is looked for once, not on every frame
        // (a change of mode inside one gesture, as Ctrl pressed during a move, keeps the ends read
        // at the start: by then the drag's own drawing may have made the grid longer)
        if (!mode) {
            this._gesture = null;
        } else if (!this._gesture && this.rendererRef()) {
            // the ends of the rows and columns, before the pill, the highlight and the badges are
            // drawn: the drag's own drawing must not let the grid scroll further (R14)
            const element = this.rendererRef();
            const scroller = this._verticalScroller();
            this._gesture = {
                scroller,
                maxLeft: element.scrollWidth - element.clientWidth,
                maxTop: scroller.scrollHeight - scroller.clientHeight,
            };
        }
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
            if (mode?.startsWith("resize-")) {
                // the shape follows the side of the edge, mirrored in right-to-left languages
                const west = (mode === "resize-start") !== this._isRtl();
                root.classList.add(west ? "o_tl_drag_west" : "o_tl_drag_east");
            }
        }
        if (mode && !this._dragMode) {
            // the gesture starts: the popover closes, and the picked cells go (R9)
            this._cancelPopover();
            this.popover.close();
            if (!this.picked.isEmpty) {
                this.clearPicked();
            }
        }
        this._dragMode = mode;
    }

    /** The cells of the row element `rowEl` and the one under `x`: `{part}`, "folded" or null. */
    _cellPart(rowEl, x, nearest = false) {
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
            return { part: open.at(-1).column * parts + parts - (nearest ? 0 : 1) };
        }
        const hit = items.find((item) => x >= item.rect.left && x < item.rect.right);
        if (!hit) {
            return null;
        }
        if (hit.column === null) {
            return "folded";
        }
        const fraction = (rtl ? hit.rect.right - x : x - hit.rect.left) / (hit.rect.width || 1);
        if (nearest) {
            if (this._dateOnly) {
                return { part: this._dayBorder(hit.column, fraction) };
            }
            // the border nearest to the pointer: 0 to `parts` within the column
            return { part: hit.column * parts + Math.min(Math.max(Math.round(fraction * parts), 0), parts) };
        }
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
        if (grab.panel) {
            return this._panelTarget(rowId, hit.part);
        }
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
        if (this._dateOnly && grab.pill) {
            // R17.1: the day (month) borders crossed since the press; the target moves by whole
            // days, kept inside the grid in whole days
            const record = grab.pill.record;
            const from = grab.press ?? record.span.from + grab.offset;
            const range = this._moveRange(record);
            const n = Math.min(
                Math.max(this._unitOf(hit.part) - this._unitOf(from), range.min),
                range.max
            );
            const span = this._movedSpan(record, n);
            return { rowId, part: span.from, length: span.to - span.from, n };
        }
        const total = data.columns.length * data.parts;
        const part = Math.min(Math.max(hit.part - grab.offset, 0), Math.max(total - grab.length, 0));
        return { rowId, part };
    }

    /**
     * 002b3 R21.2, R21.3: the target of a line of the panel over the sub-column `part` of the row
     * `rowId`: `{rowId, part, length}` (one column's length), or null when the row refuses. The
     * line starts on no row, so every row at and below a read-only grouping level refuses. On a
     * model whose bounds are both days the span is the whole day (month).
     */
    _panelTarget(rowId, part) {
        const data = this.data;
        const accepts = rowAcceptsDrop({
            rows: data.rows,
            rowId,
            startRowId: null,
            groupBy: data.groupBy,
            fields: this.props.model.fields,
        });
        if (!accepts) {
            return null;
        }
        const { placement, parts } = data;
        const gridParts = data.columns.length * parts;
        let { from, to } = panelSpan({ part, partsPerColumn: parts, gridParts });
        if (placement.startIsDate && placement.stopIsDate) {
            from = Math.floor(part / parts) * parts;
            to = from + parts - 1;
        }
        return { rowId, part: from, length: to - from + 1 };
    }

    /** The bounds are held in whole days (months on the year scale), R17. */
    get _dateOnly() {
        return hasDateOnlyBound(this.data.placement);
    }

    /** The instant at the start of sub-column `part` (the end of the grid for the last border). */
    _partTime(part) {
        const { columns, parts } = this.data;
        if (part >= columns.length * parts) {
            return columns.at(-1).stop;
        }
        const index = Math.max(Math.floor(part / parts), 0);
        const column = columns[index];
        const share = Math.max(part - index * parts, 0) / parts;
        return column.start.plus({ milliseconds: (column.stop.toMillis() - column.start.toMillis()) * share });
    }

    /** The number of the day (month on the year scale) that holds `date`, from the grid's first. */
    _boundUnit(date) {
        const first = this.data.columns[0].start;
        if (this.data.scaleId === "year") {
            return (date.year - first.year) * 12 + date.month - first.month;
        }
        return Math.round(date.startOf("day").diff(first.startOf("day"), "days").days);
    }

    /** The day (month) number of the border or sub-column `part`. */
    _unitOf(part) {
        return this._boundUnit(this._partTime(part));
    }

    /** How many days (months) a pill may move either way and stay inside the grid: {min, max}. */
    _moveRange(record) {
        const { columns, placement } = this.data;
        const last = columns.at(-1).stop.minus({ milliseconds: 1 });
        const stop = placement.stopIsDate ? record.stop : record.stop.minus({ milliseconds: 1 });
        return {
            min: -this._boundUnit(record.start),
            max: this._boundUnit(last) - this._boundUnit(stop),
        };
    }

    /** The span `record` would cover moved by `n` days (months). */
    _movedSpan(record, n) {
        const { placement, columns, parts } = this.data;
        const bounds = movedBounds(
            { start: record.start, stop: record.stop },
            n,
            dragStep(this.data, { dateOnly: true }),
            placement
        );
        return (
            pillSpan(
                { [placement.startField]: bounds.start, [placement.stopField]: bounds.stop },
                placement,
                columns,
                parts
            ) || record.span
        );
    }

    /** R17.2: the day (month) border nearest to a pointer at `fraction` of column `column`. */
    _dayBorder(column, fraction) {
        const { columns, parts, scaleId } = this.data;
        if (scaleId === "year") {
            return column * parts + (fraction >= 0.5 ? parts : 0);
        }
        const item = columns[column];
        const time = item.start.plus({
            milliseconds: (item.stop.toMillis() - item.start.toMillis()) * fraction,
        });
        const day = time.startOf("day");
        const border = time < day.plus({ hours: 12 }) ? day : day.plus({ days: 1 });
        return positionOf(border, columns, parts, false);
    }

    /** How far the part border `to` is from the border `from` on screen, or null (R17.1). */
    _partShift(from, to) {
        const rowEl = this.rendererRef().querySelector(".o_tl_row[data-row-id]");
        const { columns, parts } = this.data;
        if (!rowEl) {
            return null;
        }
        const rtl = this._isRtl();
        const x = (part) => {
            const index = Math.min(Math.floor(part / parts), columns.length - 1);
            const cell = rowEl.querySelector(`.o_tl_cell[data-column="${index}"]`);
            if (!cell) {
                return null;
            }
            const { left, right, width } = cell.getBoundingClientRect();
            const share = (part - index * parts) / parts;
            return (rtl ? right : left) + (rtl ? -share : share) * width;
        };
        const [a, b] = [x(from), x(to)];
        return a === null || b === null ? null : b - a;
    }

    /** The number of days (months) the edge `edge` of `pill` moves to the border `border`. */
    _resizeSteps(pill, edge, border) {
        const { from, to } = pill.record.span;
        if (!this._dateOnly) {
            return border - (edge === "stop" ? to : from);
        }
        // the stop's edge is the end of the stop's day, the start's the start of the start's day,
        // whatever the type of the bound: the step falls at the middle of a day (R17.2)
        const { stop } = pill.record;
        const base =
            edge === "stop"
                ? this._boundUnit(this.data.placement.stopIsDate ? stop : stop.minus({ milliseconds: 1 })) + 1
                : this._boundUnit(pill.record.start);
        return this._unitOf(border) - base;
    }

    /**
     * R8.1: the sub-column border nearest to the abscissa `x`, for the edge `edge` of `pill`; the
     * edge stays one sub-column from the other one. `undefined` over a folded column. The row
     * does not matter: every row has the same cells.
     */
    _borderAt(x, pill, edge) {
        const rowEl = this.rendererRef().querySelector(".o_tl_row[data-row-id]");
        const hit = rowEl && this._cellPart(rowEl, x, true);
        if (hit === "folded") {
            return undefined;
        }
        if (!hit) {
            return null;
        }
        const total = this.data.columns.length * this.data.parts;
        const { from, to } = pill.record.span;
        if (this._dateOnly && this.data.scaleId !== "year") {
            // never shorter than one day (R17.2)
            const { columns, parts } = this.data;
            const least = positionOf(
                this._partTime(from).startOf("day").plus({ days: 1 }),
                columns,
                parts,
                false
            );
            const most = positionOf(
                this._partTime(to).minus({ milliseconds: 1 }).startOf("day"),
                columns,
                parts,
                false
            );
            return edge === "stop"
                ? Math.min(Math.max(hit.part, least), total)
                : Math.max(Math.min(hit.part, most), 0);
        }
        return edge === "stop"
            ? Math.min(Math.max(hit.part, from + 1), total)
            : Math.max(Math.min(hit.part, to - 1), 0);
    }

    /** What is drawn while a pill is held (R3, R6): the moved pill, the highlight, the badges. */
    _setDrag(drawing) {
        this._drawing = drawing;
        if (!drawing) {
            this.state.drag = null;
            return;
        }
        if (drawing.mode === "move" || drawing.mode === "copy") {
            // kept for the release: `change(null)` comes before `commit` (R22)
            this._zoneHit = this._overDropZone(drawing);
        }
        if (drawing.mode === "panel") {
            this._setPanelDrag(drawing);
            return;
        }
        if (drawing.mode.startsWith("resize-")) {
            this._setResize(drawing);
            return;
        }
        if (drawing.mode === "lock") {
            // R11: raised in place with the lock icon; no target, badge or highlight
            const { pill, rowId, touch } = drawing;
            const { span } = pill.record;
            this.state.drag = {
                pillId: pill.id,
                mode: "lock",
                touch: Boolean(touch),
                rowId: null,
                startRowId: rowId,
                fromPart: span.from,
                toPart: null,
                length: span.to - span.from,
                badges: null,
                offset: { x: 0, y: 0 },
                ghost: this._pressed.ghost,
                lock: true,
            };
            return;
        }
        const { pill, mode, target, rowId, offset } = drawing;
        const data = this.data;
        const record = pill.record;
        const length = target?.length ?? record.span.to - record.span.from;
        let badges = null;
        if (target) {
            const n = target.n ?? target.part - record.span.from;
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
        // on a date-only model the pill goes by whole days: it sits on the target's border
        const shift = target?.n === undefined ? null : this._partShift(record.span.from, target.part);
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
                x: shift ?? offset.x + renderer.scrollLeft - pressed.scroll.left,
                y: offset.y + this._verticalScroller().scrollTop - pressed.scroll.top,
            },
            ghost: pressed.ghost,
        };
    }

    /**
     * The bounds a line of the panel dropped on `target` gets (002b3 R21.3, R21.6): the span's start
     * and end. A date-only stop takes the day of the start (002b D1).
     */
    _panelBounds(target) {
        const { placement } = this.data;
        const start = this._partTime(target.part);
        return {
            start,
            stop: placement.stopIsDate ? start : this._partTime(target.part + target.length),
        };
    }

    /** What is drawn while a line of the panel is held (R21): the highlight, the badges. */
    _setPanelDrag({ line, x, y, target }) {
        const data = this.data;
        const { placement } = data;
        let badges = null;
        if (target) {
            const { start, stop } = this._panelBounds(target);
            badges = dragBadges({
                start,
                stop,
                kind: "move",
                n: 0,
                data,
                dateOnlyStart: placement.startIsDate,
                dateOnlyStop: placement.stopIsDate,
            });
        }
        this.state.drag = {
            pillId: null,
            mode: "panel",
            rowId: target ? target.rowId : null,
            startRowId: null,
            fromPart: null,
            toPart: target ? target.part : null,
            length: target ? target.length : 0,
            badges,
            offset: { x: 0, y: 0 },
            ghost: null,
            panel: { name: line.display_name, x, y },
        };
    }

    /**
     * A press on a line of the side panel (R21): the drag starts once the pointer moved 10 px.
     * The line is copied under the pointer, keeping the place where it was grabbed.
     */
    pressLine(ev, line) {
        if (ev.button !== 0 || this.data.isSample) {
            return;
        }
        const rect = ev.currentTarget.getBoundingClientRect();
        this._linePress = {
            grabX: ev.clientX - rect.left,
            grabY: ev.clientY - rect.top,
            width: rect.width,
        };
        this._drag.pressLine(ev, { id: line.id, display_name: line.display_name });
    }

    /** The release of a drag ended a moment ago: a click on a line is its end, not an opening. */
    swallowsClick() {
        return this._drag.consumeClick();
    }

    /** The copy of the line that follows the pointer (R21.1), or null. */
    get panelGhost() {
        const drag = this.state.drag;
        if (drag?.mode !== "panel" || !this._linePress) {
            return null;
        }
        const { grabX, grabY, width } = this._linePress;
        return {
            name: drag.panel.name,
            style: `left: ${drag.panel.x - grabX}px; top: ${drag.panel.y - grabY}px; width: ${width}px`,
        };
    }

    /**
     * What is drawn while a handle is held (R6, R8): the pill with its new length, and the
     * badges, the one of the moved bound with its difference. The bounds are the record's own,
     * moved by the number of sub-columns the edge moved; an invalid result shows too (R12).
     */
    _setResize({ pill, mode, target, rowId }) {
        const edge = mode.slice("resize-".length);
        const data = this.data;
        const { placement } = data;
        const record = pill.record;
        const { from, to } = record.span;
        const border = target ? target.part : edge === "stop" ? to : from;
        const n = target ? this._resizeSteps(pill, edge, border) : 0;
        const step = dragStep(data, { dateOnly: hasDateOnlyBound(placement) });
        const bounds = {
            start: record.start,
            stop: record.stop,
            [edge]: resizedBound(record, edge, n, step, placement),
        };
        this.state.drag = {
            pillId: pill.id,
            mode,
            rowId: null,
            startRowId: rowId,
            fromPart: from,
            toPart: null,
            length: to - from,
            badges: dragBadges({
                ...bounds,
                which: edge,
                kind: "resize",
                n,
                oldStart: record.start,
                oldStop: record.stop,
                data,
                dateOnlyStart: placement.startIsDate,
                dateOnlyStop: placement.stopIsDate,
            }),
            offset: { x: 0, y: 0 },
            ghost: null,
            resize: edge === "stop" ? { from, to: border } : { from: border, to },
        };
    }

    /**
     * The moved pill and the copy left behind (S1). Each is a box of the pill's span (the body
     * and one pixel around it: M1, M5) that carries the opacity, with the body one pixel inside
     * (M3). The box of the moved pill follows the pointer; the other stays at the press.
     */
    get dragGhost() {
        const drag = this.state.drag;
        if (!drag || drag.resize || drag.mode === "panel") {
            return null;
        }
        const { ghost, offset } = drag;
        const box = (left, top) =>
            `left: ${left - PILL_INSET}px; top: ${top - PILL_INSET}px;` +
            ` width: ${ghost.width + 2 * PILL_INSET}px; height: ${ghost.height + 2 * PILL_INSET}px`;
        // The moved pill follows the pointer but never leaves the grid: it would make the grid
        // longer, and a pointer held in an edge zone would scroll without end (R14).
        const grid = this.rendererRef?.()?.querySelector(".o_tl_grid");
        const inside = (value, size, room) =>
            grid ? Math.min(Math.max(value, 0), Math.max(room - size, 0)) : value;
        return {
            ...ghost,
            locked: Boolean(drag.lock),
            // a finger on a locked pill makes it bounce a little, as the Community's own touch drag
            // does (its `o_touch_bounce`)
            className: drag.lock
                ? `${ghost.className} o_tl_pill_locked${drag.touch ? " o_touch_bounce" : ""}`
                : ghost.className,
            movedStyle: box(
                inside(ghost.left + offset.x, ghost.width, grid?.offsetWidth),
                inside(ghost.top + offset.y, ghost.height, grid?.offsetHeight)
            ),
            originStyle: box(ghost.left, ghost.top),
        };
    }

    /** Whether `pill`, as drawn in `row`, is the one the gesture holds (a record can stand in several rows). */
    _isHeld(drag, pill, row) {
        return drag?.pillId === pill.id && drag.startRowId === row.row.id;
    }

    /** The class of a pill: the pill being held leaves a faded copy where it was (S1). */
    pillClass(pill, row) {
        const drag = this.state.drag;
        if (!this._isHeld(drag, pill, row)) {
            return pill.className;
        }
        // a resized pill is drawn with its new length; a moved one is drawn by its ghost
        return `${pill.className} ${drag.resize ? "o_tl_pill_resizing" : "o_tl_pill_origin"}`;
    }

    /** The place of a pill: its stored one, or the new length while its handle is held (R8.1). */
    pillStyle(pill, row) {
        const drag = this.state.drag;
        if (!this._isHeld(drag, pill, row) || !drag.resize) {
            return pill.style;
        }
        // the pill held by a handle is drawn as its box, one pixel around the body it has at
        // rest (M34, M35); the badges stand against it (M29, M31)
        return `${this._spanStyle(drag.resize.from, drag.resize.to, this.data, 0)}; top: ${pill.top - PILL_INSET}px`;
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
    _commitDrag({ mode, pill, rowId, target, line }) {
        const overZone = this._zoneHit;
        this._zoneHit = false;
        if (overZone && (mode === "move" || mode === "copy")) {
            // 002b3 R22: over the drop zone, with Ctrl too (D2): the record loses its dates
            return this.props.editor.unscheduleRecord({ resId: pill.record.resId });
        }
        if (!target) {
            return undefined;
        }
        if (mode === "panel") {
            return this._commitPanel({ target, line });
        }
        if (mode.startsWith("resize-")) {
            return this._commitResize({ mode, pill, target });
        }
        const { model, editor } = this.props;
        const data = this.data;
        const { placement } = data;
        const fields = model.fields;
        const record = pill.record;
        const n = target.n ?? target.part - record.span.from;
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

    /**
     * The release of a line of the panel over a row (002b3 R21.6): one write of the span's start
     * and stop and every grouping value of the row and its parents, after the writes sent before;
     * the view reloads, no notification, no Undo. The values are not compared with the record's.
     */
    _commitPanel({ target, line }) {
        const { model, editor } = this.props;
        const data = this.data;
        const values = copyDefaults({
            bounds: this._panelBounds(target),
            targetChain: rowValueChain(data.rows, target.rowId, model.fields),
            fields: model.fields,
            placement: data.placement,
        });
        return editor.scheduleRecord({ resId: line.id, values });
    }

    /**
     * The release of a handle (R8.2, R8.3, R12): the moved bound of the record, alone, moves by
     * the sub-columns the edge moved. Nothing happens when it did not move (D3); an impossible
     * result writes nothing and raises a warning. A refusal is the caller's, as for a move.
     */
    _commitResize({ mode, pill, target }) {
        const edge = mode.slice("resize-".length);
        const { model, editor } = this.props;
        const data = this.data;
        const { placement } = data;
        const record = pill.record;
        const n = this._resizeSteps(pill, edge, target.part);
        if (!n) {
            return undefined;
        }
        const value = resizedBound(
            record,
            edge,
            n,
            dragStep(data, { dateOnly: hasDateOnlyBound(placement) }),
            placement
        );
        if (resizeIsInvalid(record, edge, value, placement)) {
            editor.warn(
                edge === "start"
                    ? _t("The start cannot come after the end.")
                    : _t("The end cannot come before the start.")
            );
            return undefined;
        }
        const field = edge === "start" ? placement.startField : placement.stopField;
        const isDate = edge === "start" ? placement.startIsDate : placement.stopIsDate;
        return editor.applyChange({
            kind: "resize",
            resId: record.resId,
            values: { [field]: serializeBound(value, isDate ? "date" : "datetime") },
            undo: {
                values: undoValues({
                    kind: "resize",
                    record,
                    fields: model.fields,
                    placement,
                }),
            },
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
            top: LINE_GAP + (line - 1) * LINE_STEP,
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
