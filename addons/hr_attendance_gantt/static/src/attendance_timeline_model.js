// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { serializeDateTime } from "@web/core/l10n/dates";
import { EmployeeTimelineModel } from "@hr_gantt/employee_timeline_model";
import { rangeAroundToday } from "@web_gantt/timeline_dates";
import { onePeriod, periodDomain } from "./attendance_layout";

const { DateTime } = luxon;

/** The field the rows stand for, and the one the list of employees without a contract names. */
const EMPLOYEE_FIELD = "employee_id";

/**
 * The model of the attendance variant of the Gantt view: one period per named range (R12), the
 * records shown with the open attendances (R13) and the employees without a contract (R19).
 */
export class AttendanceTimelineModel extends EmployeeTimelineModel {
    // ------------------------------------------------------------------------
    // R12: one period per range
    // ------------------------------------------------------------------------

    /** The first display builds one period too (a named range only; a custom one is 002a's). */
    _firstRange(context) {
        const range = super._firstRange(context);
        return range.kind === "custom" ? range : onePeriod(range.kind, range.focus);
    }

    /** Choosing a range from the menu (R6 picks the focus date when none is given). */
    async setKind(kind, focus) {
        this._dropPendingStep();
        const range = onePeriod(kind, (focus || this._focusForKind(kind)).startOf("day"));
        await this._reload({ range });
        this.notify();
    }

    /** Today (002a R10 point 2): a scroll when today is displayed, else today's one period. */
    async goToday() {
        this._dropPendingStep();
        const today = DateTime.now().startOf("day");
        if (today >= this.period.start && today < this.period.stop) {
            return super.goToday();
        }
        const around = rangeAroundToday(this.range, today);
        const range = around.kind === "custom" ? around : onePeriod(around.kind, today);
        await this._reload({ range });
        this.notify();
        return "reloaded";
    }

    // ------------------------------------------------------------------------
    // R13: records shown, open attendances
    // ------------------------------------------------------------------------

    /** The browser's now is read once for each load, and so is the condition built from it. */
    async _reload(params) {
        this._loadNow = DateTime.now();
        return super._reload(params);
    }

    _request(range, offset) {
        const now = this._loadNow || DateTime.now();
        this._requestNow = now;
        const request = super._request(range, offset);
        request.now = now;
        return request;
    }

    /** R13: replaces 002a R4's period condition. */
    _periodDomain(period) {
        const { startField, stopField } = this.config;
        const now = this._requestNow || DateTime.now();
        return periodDomain(
            startField,
            stopField,
            serializeDateTime(period.start),
            serializeDateTime(period.stop),
            serializeDateTime(now),
            now >= period.start
        );
    }

    _commit(request, result) {
        this._now = request.now;
        super._commit(request, result);
    }

    /**
     * An open attendance (no check-out) is drawn from its check-in to now; the record's own
     * data (`raw`) is left as the server sent it. 002a then snaps the end to its sub-column.
     */
    _parseRecords(rawRecords) {
        const { stopField } = this.config;
        const nowText = serializeDateTime(this._now || DateTime.now());
        const originals = new Map(rawRecords.map((raw) => [raw.id, raw]));
        const shown = rawRecords.map((raw) =>
            raw[stopField] ? raw : { ...raw, [stopField]: nowText }
        );
        const records = super._parseRecords(shown);
        for (const record of records) {
            const original = originals.get(record.id);
            record.isOpen = !original[stopField];
            record.raw = original;
        }
        return records;
    }

    // ------------------------------------------------------------------------
    // R19: employees without a contract
    // ------------------------------------------------------------------------

    /** Red names exist for the grouping by employee alone (R19). */
    _publish() {
        super._publish();
        const ids =
            this.groupBy.length === 1 && this.groupBy[0] === EMPLOYEE_FIELD
                ? this._response?.hag_without_contract
                : null;
        this._data = { ...this._data, withoutContract: new Set(ids || []) };
    }
}
