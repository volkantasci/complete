// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { browser } from "@web/core/browser/browser";
import { Domain } from "@web/core/domain";
import {
    deserializeDate,
    deserializeDateTime,
    serializeDate,
    serializeDateTime,
} from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { KeepLast } from "@web/core/utils/concurrency";
import { imageUrl } from "@web/core/utils/urls";
import { addPropertyFieldDefs, Model } from "@web/model/model";
import { formatFloat } from "@web/views/fields/formatters";
import {
    buildColumnGroups,
    buildColumns,
    displayedPeriod,
    fixCustomDates,
    initialRange,
    namedRange,
    rangeAroundToday,
    scaleForCustom,
    scaleForKind,
    stepRange,
    TIMELINE_KINDS,
    TIMELINE_SCALES,
    partsFor,
} from "./timeline_dates";
import { pillSpan } from "./timeline_layout";

const { DateTime } = luxon;

const STEP_DELAY = 500;
const NUMBER_TYPES = ["integer", "float", "monetary"];
const RELATIONAL_TYPES = ["many2one", "many2many", "one2many"];

const storageKey = (viewId) => `rangeOf-viewId-${viewId}`;

function groupByFieldName(groupBy) {
    return groupBy.split(":")[0];
}

/**
 * Data of a timeline view: the displayed range, one page of groups, the records read for them
 * and the rows built from both. It makes no UI.
 */
export class TimelineModel extends Model {
    /**
     * @param {Object} params
     * @param {string} params.resModel
     * @param {Object} params.fields field descriptions of the model
     * @param {Object} params.config result of `parseTimelineArch`
     * @param {number|false} [params.viewId]
     */
    setup(params) {
        this.resModel = params.resModel;
        this.fields = { ...params.fields };
        this.config = params.config;
        this.viewId = params.viewId;
        this.keepLast = new KeepLast();
        this.displayMode = this.config.displayMode;
        this.range = null;
        this.scaleId = null;
        this.period = null;
        this.columns = [];
        this.columnGroups = [];
        this.parts = 1;
        this.offset = 0;
        this.groupBy = [];
        this.domain = [];
        this.context = {};
        this.isSample = false;
        this._hasLoaded = false;
        this._response = { groups: [], records: [], length: 1 };
        this._records = [];
        this._rows = [];
        this._collapsed = new Set();
        this._targetRange = null;
        this._timer = null;
        this._waiters = [];
        this._publish();
    }

    // ------------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------------

    /** Placement options `pillSpan` needs for the start and stop fields. */
    get placement() {
        return {
            startField: this.config.startField,
            stopField: this.config.stopField,
            startIsDate: this.fields[this.config.startField]?.type === "date",
            stopIsDate: this.fields[this.config.stopField]?.type === "date",
        };
    }

    get data() {
        return this._data;
    }

    hasData() {
        return this._response.records.length > 0;
    }

    /**
     * @param {Object} searchParams
     * @param {Array} [searchParams.domain]
     * @param {string[]} [searchParams.groupBy]
     * @param {Object} [searchParams.context]
     */
    async load(searchParams = {}) {
        const domain = new Domain(searchParams.domain || []).toList();
        const context = searchParams.context || {};
        const groupBy = await this._cleanGroupBy(searchParams.groupBy || [], context);
        const sameSearch =
            JSON.stringify(domain) === JSON.stringify(this.domain) &&
            JSON.stringify(context) === JSON.stringify(this.context) &&
            JSON.stringify(groupBy) === JSON.stringify(this.groupBy);
        if (JSON.stringify(groupBy) !== JSON.stringify(this.groupBy)) {
            this._collapsed = new Set();
        }
        this.domain = domain;
        this.groupBy = groupBy;
        this.context = context;
        const offset = sameSearch ? this.offset : 0;
        const range = this.range || this._firstRange(context);
        await this._reload({ range, offset });
    }

    /** Choose a named range around `focus` (default: the current focus). */
    async setKind(kind, focus) {
        this._dropPendingStep();
        const range = namedRange(kind, (focus || this.range.focus).startOf("day"));
        await this._reload({ range });
        this.notify();
    }

    /** Apply custom dates; `edited` tells which date the user changed last. */
    async applyCustom(start, stop, { focus, edited = "start" } = {}) {
        this._dropPendingStep();
        const dates = fixCustomDates(start.startOf("day"), stop.startOf("day"), edited);
        let day = (focus || this.range.focus).startOf("day");
        day = day < dates.start ? dates.start : day > dates.stop ? dates.stop : day;
        await this._reload({ range: { kind: "custom", ...dates, focus: day } });
        this.notify();
    }

    /**
     * Move the range one period back (-1) or forward (+1). Loads once, half a second after
     * the last call. The promise settles when that load is done.
     */
    step(direction) {
        this._targetRange = stepRange(this._targetRange || this.range, direction);
        browser.clearTimeout(this._timer);
        const promise = new Promise((resolve) => this._waiters.push(resolve));
        this._timer = browser.setTimeout(async () => {
            const range = this._targetRange;
            this._timer = null;
            try {
                await this._reload({ range });
                this.notify();
            } finally {
                this._flushWaiters();
            }
        }, STEP_DELAY);
        this._publish();
        this.notify();
        return promise;
    }

    /** @returns {Promise<"scrolled"|"reloaded">} */
    async goToday() {
        this._dropPendingStep();
        const today = DateTime.now().startOf("day");
        if (today >= this.period.start && today < this.period.stop) {
            this.range = { ...this.range, focus: today };
            this._publish();
            this.notify();
            return "scrolled";
        }
        await this._reload({ range: rangeAroundToday(this.range, today) });
        this.notify();
        return "reloaded";
    }

    toggleRow(rowId) {
        if (this._collapsed.has(rowId)) {
            this._collapsed.delete(rowId);
        } else {
            this._collapsed.add(rowId);
        }
        this._applyCollapsed();
        this._publish();
        this.notify();
    }

    setAllCollapsed(collapsed) {
        this._collapsed = new Set();
        if (collapsed) {
            const visit = (rows) => {
                for (const row of rows) {
                    if (row.isGroup) {
                        this._collapsed.add(row.id);
                        visit(row.children);
                    }
                }
            };
            visit(this._rows);
        }
        this._applyCollapsed();
        this._publish();
        this.notify();
    }

    toggleDisplayMode() {
        this.displayMode = this.displayMode === "dense" ? "sparse" : "dense";
        this._collapsed = new Set();
        this._rows = this._buildRows();
        this._publish();
        this.notify();
    }

    async setOffset(offset) {
        await this._reload({ offset });
        this.notify();
    }

    // ------------------------------------------------------------------------
    // Range
    // ------------------------------------------------------------------------

    _dropPendingStep() {
        browser.clearTimeout(this._timer);
        this._timer = null;
        this._targetRange = null;
        this._flushWaiters();
    }

    /** A superseded load never settles, so the last one releases every waiting caller. */
    _flushWaiters() {
        const waiters = this._waiters;
        this._waiters = [];
        waiters.forEach((resolve) => resolve());
    }

    _firstRange(context) {
        const parseDay = (value) => {
            if (!value) {
                return null;
            }
            if (DateTime.isDateTime(value)) {
                return value.startOf("day");
            }
            const text = String(value);
            return (
                text.length > 10 ? deserializeDateTime(text) : deserializeDate(text)
            ).startOf("day");
        };
        const today = DateTime.now().startOf("day");
        let storedKind = null;
        if (this.viewId) {
            storedKind = browser.localStorage.getItem(storageKey(this.viewId));
        }
        const focus = parseDay(context.initialDate) || today;
        return initialRange({
            storedKind: TIMELINE_KINDS.includes(storedKind) ? storedKind : null,
            contextKind: context.default_range || context.default_scale || null,
            defaultKind: this.config.defaultKind,
            contextStart: parseDay(context.default_start_date),
            contextStop: parseDay(context.default_stop_date),
            focus,
            today,
            offered: this.config.offeredKinds,
        });
    }

    _scaleOf(range) {
        return range.kind === "custom"
            ? scaleForCustom(range.start, range.stop, this.config.offeredKinds)
            : scaleForKind(range.kind);
    }

    // ------------------------------------------------------------------------
    // Server call
    // ------------------------------------------------------------------------

    async _cleanGroupBy(groupBy, context) {
        // property definitions first: a date property is only known by its definition
        await addPropertyFieldDefs(this.orm, this.resModel, context, this.fields, groupBy);
        return groupBy.filter((name) => {
            const type = (this.fields[name] || this.fields[groupByFieldName(name)])?.type;
            return type !== "date" && type !== "datetime";
        });
    }

    _isRelational(fieldName) {
        return RELATIONAL_TYPES.includes(this.fields[fieldName]?.type);
    }

    _periodDomain(period) {
        const { startField, stopField, startIsDate, stopIsDate } = this.placement;
        // R4, literally: a date-only stop field makes the first comparison a date one, a
        // date-only start field makes the second one "on or after" the first day
        return [
            [startField, "<", (stopIsDate ? serializeDate : serializeDateTime)(period.stop)],
            startIsDate
                ? [stopField, ">=", serializeDate(period.start)]
                : [stopField, ">", serializeDateTime(period.start)],
        ];
    }

    _readSpecification() {
        const { startField, stopField } = this.config;
        const names = new Set([
            startField,
            stopField,
            ...this.config.extraFieldNames,
            ...this.groupBy.map(groupByFieldName),
        ]);
        const specification = { display_name: {} };
        for (const name of names) {
            const field = this.fields[name];
            if (!field || name.includes(".")) {
                continue;
            }
            specification[name] =
                field.type === "many2one" ? { fields: { display_name: {} } } : {};
        }
        return specification;
    }

    _request(range, offset) {
        const scaleId = this._scaleOf(range);
        const period = displayedPeriod(range, scaleId);
        const grouped = this.groupBy.length > 0;
        const kwargs = {
            domain: Domain.and([this.domain, this._periodDomain(period)]).toList(),
            groupby: this.groupBy,
            read_specification: this._readSpecification(),
            start_date: serializeDateTime(period.start),
            stop_date: serializeDateTime(period.stop),
            scale: TIMELINE_SCALES[scaleId].group,
            context: this.context,
        };
        if (grouped && this.config.groupsLimit) {
            kwargs.limit = this.config.groupsLimit;
            kwargs.offset = offset || 0;
        }
        const last = this.groupBy.at(-1);
        if (this.config.showUnavailability && last && this._isRelational(last)) {
            kwargs.unavailability_fields = [last];
        }
        const progressFields = this.config.progressBarFields.filter(
            (name) => this.groupBy.includes(name) && this._isRelational(name)
        );
        if (progressFields.length) {
            kwargs.progress_bar_fields = progressFields;
        }
        return { range, scaleId, period, offset: offset || 0, kwargs };
    }

    async _reload({ range = this.range, offset = this.offset } = {}) {
        const request = this._request(range, offset);
        const result = await this.keepLast.add(
            this.orm.call(this.resModel, "get_gantt_data", [], request.kwargs)
        );
        this._commit(request, result);
    }

    _commit(request, result) {
        const { range, scaleId, period } = request;
        if (!this._timer) {
            // a click made while this load was in flight keeps its target
            this._targetRange = null;
        }
        this.range = range;
        this.scaleId = scaleId;
        this.period = period;
        this.offset = request.offset;
        this.columns = buildColumns(scaleId, period);
        this.columnGroups = buildColumnGroups(scaleId, this.columns);
        this.parts = partsFor(scaleId, this.config.precision);
        this.isSample = !this._hasLoaded && this.config.sample && !result.records.length;
        this._hasLoaded = true;
        this._response = result;
        this._unavailability = this.isSample ? {} : this._parseUnavailability(result);
        this._progress = this.isSample ? {} : result.progress_bars || {};
        this._records = this._parseRecords(result.records);
        this._rows = this._buildRows();
        if (this.viewId) {
            browser.localStorage.setItem(storageKey(this.viewId), range.kind);
        }
        this._publish();
    }

    _parseUnavailability(result) {
        const parsed = {};
        for (const [field, byValue] of Object.entries(result.unavailabilities || {})) {
            parsed[field] = {};
            for (const [id, periods] of Object.entries(byValue || {})) {
                parsed[field][id] = periods.map((period) => ({
                    start: deserializeDateTime(period.start),
                    stop: deserializeDateTime(period.stop),
                }));
            }
        }
        return parsed;
    }

    // ------------------------------------------------------------------------
    // Records
    // ------------------------------------------------------------------------

    _parseDate(value, fieldName) {
        if (!value) {
            return null;
        }
        return this.fields[fieldName]?.type === "date"
            ? deserializeDate(value)
            : deserializeDateTime(value);
    }

    /** Records that can be drawn: both dates, stop not before start, inside the period. */
    _parseRecords(rawRecords) {
        const { startField, stopField } = this.config;
        const records = [];
        for (const raw of rawRecords) {
            const start = this._parseDate(raw[startField], startField);
            const stop = this._parseDate(raw[stopField], stopField);
            const record = {
                id: raw.id,
                resId: raw.id,
                displayName: raw.display_name,
                raw,
                start,
                stop,
                allocatedHours: raw.allocated_hours || 0,
            };
            record[startField] = start;
            record[stopField] = stop;
            const span = start && stop && pillSpan(record, this.placement, this.columns, this.parts);
            if (span) {
                record.span = span;
                records.push(record);
            }
        }
        return records;
    }

    // ------------------------------------------------------------------------
    // Rows
    // ------------------------------------------------------------------------

    _isEmptyValue(fieldName, value) {
        const type = this.fields[fieldName]?.type;
        if (type === "boolean") {
            return false;
        }
        if (NUMBER_TYPES.includes(type) && value === 0) {
            return true;
        }
        return value === false || value === null || value === undefined || value === "";
    }

    _valueKey(fieldName, value) {
        if (this._isEmptyValue(fieldName, value)) {
            return "false";
        }
        return JSON.stringify(Array.isArray(value) ? value[0] : value);
    }

    _valueName(fieldName, value) {
        return String(this._rawValueName(fieldName, value));
    }

    _rawValueName(fieldName, value) {
        const field = this.fields[fieldName];
        if (this._isEmptyValue(fieldName, value)) {
            return `${_t("Undefined")} ${field.string}`;
        }
        switch (field.type) {
            case "many2one":
            case "many2many":
            case "one2many":
                return Array.isArray(value) ? value[1] : String(value);
            case "selection": {
                const pair = (field.selection || []).find(([key]) => key === value);
                return pair ? pair[1] : String(value);
            }
            case "boolean":
                return value ? _t("True") : _t("False");
            case "float":
            case "monetary":
                return formatFloat(value);
            default:
                return String(value);
        }
    }

    _makeGroupRow(fieldName, value, level, id) {
        const field = this.fields[fieldName];
        const empty = this._isEmptyValue(fieldName, value);
        const resId = !empty && Array.isArray(value) ? value[0] : null;
        const imageField = this.config.thumbnails[fieldName];
        return {
            id,
            name: this._valueName(fieldName, value),
            level,
            isGroup: false,
            fieldName,
            resId,
            value: empty ? false : value,
            recordIds: [],
            children: [],
            collapsed: false,
            thumbnailUrl:
                imageField && resId && field.relation
                    ? imageUrl(field.relation, resId, imageField)
                    : null,
            isEmptyValueRow: empty,
        };
    }

    _makeRecordRow(record, level, parentId) {
        return {
            id: `${parentId}|record=${record.id}`,
            name: record.displayName,
            level,
            isGroup: false,
            fieldName: null,
            resId: record.id,
            value: false,
            recordIds: [record.id],
            children: [],
            collapsed: false,
            thumbnailUrl: null,
            isEmptyValueRow: false,
        };
    }

    _makeBlankRow(level, id, recordIds = []) {
        return {
            id,
            name: "",
            level,
            isGroup: false,
            fieldName: null,
            resId: null,
            value: false,
            recordIds,
            children: [],
            collapsed: false,
            thumbnailUrl: null,
            isEmptyValueRow: false,
        };
    }

    _groupsForRows() {
        return this.isSample ? this._sampleGroups() : this._response.groups;
    }

    /** Sample rows: two values per grouping level, no record. */
    _sampleGroups() {
        let combos = [{}];
        for (const name of this.groupBy) {
            const field = this.fields[name];
            let values;
            if (field.type === "selection") {
                values = (field.selection || []).slice(0, 2).map(([key]) => key);
            } else if (field.type === "boolean") {
                values = [true, false];
            } else if (RELATIONAL_TYPES.includes(field.type)) {
                values = [1, 2].map((n) => [-n, _t("Sample %(n)s", { n }).toString()]);
            } else if (NUMBER_TYPES.includes(field.type)) {
                values = [1, 2];
            } else {
                values = [1, 2].map((n) => _t("Sample %(n)s", { n }).toString());
            }
            combos = combos.flatMap((combo) =>
                values.map((value) => ({ ...combo, [name]: value }))
            );
        }
        return combos.map((combo) => ({ ...combo, __record_ids: [] }));
    }

    _buildRows() {
        const drawn = new Set(this._records.map((record) => record.id));
        const byId = new Map(this._records.map((record) => [record.id, record]));
        const sparse = this.displayMode === "sparse";
        const groupBy = this.groupBy;
        if (!groupBy.length) {
            const ids = this._records.map((record) => record.id);
            if (!sparse || !ids.length) {
                return [this._makeBlankRow(0, "all", ids)];
            }
            return ids.map((id) => this._makeRecordRow(byId.get(id), 0, "all"));
        }
        const roots = [];
        const index = new Map();
        for (const group of this._groupsForRows()) {
            let siblings = roots;
            let parentKey = "";
            let node = null;
            groupBy.forEach((name, level) => {
                const value = group[name];
                const key = `${parentKey}|${name}=${this._valueKey(name, value)}`;
                node = index.get(key);
                if (!node) {
                    node = this._makeGroupRow(name, value, level, key);
                    index.set(key, node);
                    siblings.push(node);
                }
                siblings = node.children;
                parentKey = key;
            });
            for (const id of group.__record_ids || []) {
                if (drawn.has(id) && !node.recordIds.includes(id)) {
                    node.recordIds.push(id);
                }
            }
        }
        // the row for "no value" comes first at every level
        const emptyFirst = (rows) => {
            rows.sort((a, b) => Number(b.isEmptyValueRow) - Number(a.isEmptyValueRow));
            rows.forEach((row) => emptyFirst(row.children));
        };
        emptyFirst(roots);
        // the first level always has an empty-value row, with empty rows below it
        const first = groupBy[0];
        if (this._canBeEmpty(first) && !roots.some((row) => row.isEmptyValueRow)) {
            roots.unshift(this._emptyChain(0, ""));
        }
        if (!roots.length) {
            return [this._makeBlankRow(0, "all")];
        }
        const finish = (row) => {
            row.children.forEach(finish);
            const leaf = row.level === groupBy.length - 1;
            if (leaf && sparse) {
                row.children = row.recordIds.length
                    ? row.recordIds.map((id) =>
                          this._makeRecordRow(byId.get(id), row.level + 1, row.id)
                      )
                    : [this._makeBlankRow(row.level + 1, `${row.id}|blank`)];
            } else if (!leaf) {
                row.recordIds = [...new Set(row.children.flatMap((child) => child.recordIds))];
            }
            row.isGroup = row.children.length > 0;
        };
        roots.forEach(finish);
        return roots;
    }

    /** A required field or a yes/no field has no "no value" row of its own. */
    _canBeEmpty(fieldName) {
        // False of a yes/no field is a value shown as "False" (A58), not an absent one
        const field = this.fields[fieldName];
        return !field.required && field.type !== "boolean";
    }

    _emptyChain(level, parentKey) {
        const name = this.groupBy[level];
        const key = `${parentKey}|${name}=false`;
        const row = this._makeGroupRow(name, false, level, key);
        const next = this.groupBy[level + 1];
        if (next && this._canBeEmpty(next)) {
            row.children.push(this._emptyChain(level + 1, key));
        }
        return row;
    }

    _applyCollapsed() {
        const visit = (rows) => {
            for (const row of rows) {
                row.collapsed = row.isGroup && this._collapsed.has(row.id);
                visit(row.children);
            }
        };
        visit(this._rows);
    }

    _visibleRows() {
        const visible = [];
        const visit = (rows) => {
            for (const row of rows) {
                visible.push(row);
                if (row.isGroup && !row.collapsed) {
                    visit(row.children);
                }
            }
        };
        visit(this._rows);
        return visible;
    }

    // ------------------------------------------------------------------------
    // Published data
    // ------------------------------------------------------------------------

    _publish() {
        this._applyCollapsed();
        this._data = {
            range: this.range,
            pendingRange: this._targetRange,
            scaleId: this.scaleId,
            period: this.period,
            columns: this.columns,
            columnGroups: this.columnGroups,
            parts: this.parts,
            placement: this.placement,
            rows: this._rows,
            visibleRows: this._visibleRows(),
            records: this._records,
            recordsById: new Map(this._records.map((record) => [record.id, record])),
            length: this._response.length,
            offset: this.offset,
            groupBy: this.groupBy,
            isSample: this.isSample,
            displayMode: this.displayMode,
            progress: this._progress || {},
            unavailability: this._unavailability || {},
            unavailabilityField: Object.keys(this._unavailability || {})[0] || null,
        };
    }
}
