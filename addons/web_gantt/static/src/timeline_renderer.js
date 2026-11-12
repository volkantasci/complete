// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, onWillUnmount, proxy, t, useProps } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
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
import { POPOVER_DELAY, TimelinePopover } from "./timeline_popover";

const { DateTime } = luxon;

/** Decoration names in the order the corner mark picks one when several hold. */
const DECORATION_ORDER = ["danger", "warning", "success", "info", "secondary"];
/** Vertical space of one line of pills, and the gap above the first pill of a line. */
const LINE_STEP = 25;
const LINE_GAP = 2;
const GROUP_ROW_HEIGHT = 40;
/** Width of a folded column, in pixels (M45). */
const FOLDED_WIDTH = 36;

function textOfDate(date) {
    return date.toLocaleString(DateTime.DATE_FULL);
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
 */
export class TimelineRenderer extends Component {
    static template = "web_gantt.TimelineRenderer";
    props = useProps({
        model: t.object(),
        archInfo: t.object(),
    });

    setup() {
        this.ui = useService("ui");
        this._cache = { data: null, small: null, version: null, layout: null };
        // folded columns: the runs the user opened, by the index of their first column; reset when
        // the range or the scale changes. `state.version` makes a change redraw the grid.
        this.state = proxy({ version: 0 });
        this._opened = new Set();
        this._openedKey = null;
        this._fold = null;
        this._popoverTimer = null;
        this.popover = usePopover(TimelinePopover, { position: "bottom" });
        onWillUnmount(() => browser.clearTimeout(this._popoverTimer));
    }

    /**
     * A single click on a pill opens its popover after a short delay; a double click comes in
     * between and cancels it (R30). The open popover closes on the click itself (click away) and
     * the new one opens, so another pill swaps the popovers.
     */
    onPillClick(ev, pill) {
        const target = ev.currentTarget;
        browser.clearTimeout(this._popoverTimer);
        this._popoverTimer = browser.setTimeout(() => {
            this._popoverTimer = null;
            this.popover.open(target, {
                model: this.props.model,
                archInfo: this.props.archInfo,
                record: pill.record,
            });
        }, POPOVER_DELAY);
    }

    onPillDoubleClick() {
        browser.clearTimeout(this._popoverTimer);
        this._popoverTimer = null;
    }

    get data() {
        return this.props.model.data;
    }

    /** The date in the middle of the visible part of the grid; the focus date for now (R39). */
    visibleMiddleDate() {
        return this.data.range.focus;
    }

    /** A click on a group row (its header or a cell) folds or opens it (R22). */
    onRowClick(descriptor) {
        if (descriptor.kind === "group") {
            this.props.model.toggleRow(descriptor.row.id);
        }
    }

    /** A click on a folded cell (any row) opens its run; other cells leave the click to the row. */
    onCellClick(ev, cell) {
        if (cell.run !== undefined) {
            ev.stopPropagation();
            this._setRunOpen(cell.run, true);
        }
    }

    /** A click on a folded header opens its run, on the header of an open foldable one folds it. */
    onColumnClick(column) {
        if (column.folded) {
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
        if (column.folded || column.run === null) {
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
        ev.currentTarget.classList.add("o_tl_hover");
    }

    onPointerLeave(ev) {
        ev.currentTarget.classList.remove("o_tl_hover");
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
            template: hasRowHeaders ? `var(--o-tl-row-header-width) ${track}` : track,
            columns: fold.headers.map((header) => this._columnView(header)),
            groups: data.columnGroups
                .map((group) => this._groupView(group, fold))
                // all columns folded: the one column keeps the first group header
                .slice(0, fold.everyFolded ? 1 : undefined),
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
        const rawRuns = foldableRuns({
            columns: data.columns,
            rowsUnavailable: [...unavailable.values()],
            pillsSubRanges: data.records.map((record) => ({
                from: record.span.from,
                to: record.span.to,
            })),
            scaleId: data.scaleId,
            parts: data.parts,
        });
        const runs = this._splitRuns(rawRuns, data);
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
        for (let index = 0; index < count; index++) {
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
        }
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
            plainCells: cellsFor(null),
            cellsFor,
            foldedBefore,
            runsBefore,
            foldedColumns: foldedBefore[count],
            foldedWidth: foldedRuns * FOLDED_WIDTH,
        };
    }

    /**
     * A folded track holds one column group header at most, so a run is cut at the boundaries of
     * the column groups (weeks, months, ...). A run of every column stays whole: the grid is then
     * one full-width column.
     */
    _splitRuns(runs, data) {
        const count = data.columns.length;
        if (runs.length === 1 && runs[0].first === 0 && runs[0].last === count - 1) {
            return runs;
        }
        const bounds = new Set(data.columnGroups.map((group) => group.firstColumn));
        const parts = [];
        for (const run of runs) {
            let first = run.first;
            for (let index = run.first + 1; index <= run.last; index++) {
                if (bounds.has(index)) {
                    parts.push({ first, last: index - 1 });
                    first = index;
                }
            }
            parts.push({ first, last: run.last });
        }
        return data.scaleId === "week" ? parts : parts.filter((run) => run.last > run.first);
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
            style = `background-image: linear-gradient(to right, ${stops.join(", ")})`;
        }
        return { key: index, className: classes.join(" "), style };
    }

    _columnView(header) {
        if (header.folded) {
            return {
                key: `fold-${header.index}`,
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
                title = start.toLocaleString({
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hourCycle: is24HourFormat() ? "h23" : "h12",
                });
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
            label,
            meridiem,
            title,
            date: start.toISODate(),
            isToday: column.isToday,
            run: header.run,
            style: `grid-column: ${header.gridColumn}`,
        };
    }

    _groupView(group, fold) {
        let label = group.label;
        if (this.ui.isSmall && this.data.scaleId === "month") {
            label = group.start.toLocaleString({ month: "short", year: "numeric" });
        }
        const first = fold.gridColumn[group.firstColumn];
        const last = fold.gridColumn[group.firstColumn + group.span - 1];
        return {
            label,
            title: group.tooltip,
            style: `grid-column: ${first} / span ${last - first + 1}`,
        };
    }

    /**
     * Position of the sub-column range `[from, to)` over the pills layer, as inline style. Folded
     * columns have a fixed width, the others share what is left; no range crosses a folded column.
     */
    _spanStyle(from, to, data) {
        const total = data.columns.length * data.parts;
        const fold = this._fold;
        const units = total - fold.foldedColumns * data.parts;
        if (!fold.foldedColumns || units <= 0) {
            return `left: ${(from / total) * 100}%; width: ${((to - from) / total) * 100}%`;
        }
        const column = Math.min(Math.floor(from / data.parts), data.columns.length);
        const before = from - fold.foldedBefore[column] * data.parts;
        const rest = `(100% - ${fold.foldedWidth}px)`;
        const left = `calc(${rest} * ${before / units} + ${fold.runsBefore[column] * FOLDED_WIDTH}px)`;
        return `left: ${left}; width: calc(${rest} * ${(to - from) / units})`;
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
                `${this._spanStyle(from, to, data)};` +
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
        const evalContext = { context: user.context };
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
