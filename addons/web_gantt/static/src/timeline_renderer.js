// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, t, useProps } from "@odoo/owl";
import { is24HourFormat } from "@web/core/l10n/time";
import { evaluateBooleanExpr } from "@web/core/py_js/py";
import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";
import { colorIndexOf, pillLabel, rowHeightFor, stackPills } from "./timeline_layout";
import { columnWidth } from "./timeline_dates";

const { DateTime } = luxon;

/** Decoration names in the order the corner mark picks one when several hold. */
const DECORATION_ORDER = ["danger", "warning", "success", "info", "secondary"];
/** Vertical space of one line of pills, and the gap above the first pill of a line. */
const LINE_STEP = 25;
const LINE_GAP = 2;
const GROUP_ROW_HEIGHT = 40;

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
        this._cache = { data: null, layout: null };
    }

    get data() {
        return this.props.model.data;
    }

    /** The date in the middle of the visible part of the grid; the focus date for now (R39). */
    visibleMiddleDate() {
        return this.data.range.focus;
    }

    // ------------------------------------------------------------------------
    // Layout
    // ------------------------------------------------------------------------

    /** Everything the template reads, rebuilt only when the model published new data. */
    get layout() {
        const data = this.data;
        if (this._cache.data !== data) {
            this._cache = { data, layout: this._buildLayout(data) };
        }
        return this._cache.layout;
    }

    _buildLayout(data) {
        const hasRowHeaders = data.groupBy.length > 0 || data.displayMode === "sparse";
        const offset = hasRowHeaders ? 2 : 1;
        const { width: minWidth } = columnWidth(data.scaleId, data.columns.length, data.parts, 0);
        const track = `repeat(${data.columns.length}, minmax(${minWidth}px, 1fr))`;
        return {
            hasRowHeaders,
            template: hasRowHeaders ? `var(--o-tl-row-header-width) ${track}` : track,
            columns: data.columns.map((column, index) => this._columnView(column, index, offset)),
            groups: data.columnGroups.map((group) => this._groupView(group, offset)),
            rows: this._buildRows(data),
            totalParts: data.columns.length * data.parts,
        };
    }

    _columnView(column, index, offset) {
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
            style: `grid-column: ${index + offset}`,
        };
    }

    _groupView(group, offset) {
        let label = group.label;
        if (this.ui.isSmall && this.data.scaleId === "month") {
            label = group.start.toLocaleString({ month: "short", year: "numeric" });
        }
        return {
            label,
            title: group.tooltip,
            style: `grid-column: ${group.firstColumn + offset} / span ${group.span}`,
        };
    }

    /** One descriptor per visible row. */
    _buildRows(data) {
        return data.visibleRows.map((row) => {
            if (row.isGroup) {
                return {
                    kind: "group",
                    key: row.id,
                    row,
                    height: GROUP_ROW_HEIGHT,
                    pills: [],
                };
            }
            const pills = stackPills(this._pillsOfRow(row, data));
            const lines = pills.reduce((most, pill) => Math.max(most, pill.line), 0);
            return {
                kind: "pills",
                key: row.id,
                row,
                height: rowHeightFor(lines),
                pills: pills.map((pill) => this.pillOf(pill.record, pill.line)),
            };
        });
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
        const total = data.columns.length * data.parts;
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
                `left: ${(from / total) * 100}%; width: ${((to - from) / total) * 100}%;` +
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
            } catch {
                return false;
            }
        });
    }
}
