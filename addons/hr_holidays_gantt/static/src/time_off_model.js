// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { EmployeeTimelineModel } from "@hr_gantt/employee_timeline_model";
import { rangeAroundToday } from "@web_gantt/timeline_dates";
import { hhgOnePeriod } from "./time_off_layout";

const { DateTime, Settings } = luxon;

/**
 * The model of the leave view: the grouping and the browser's zone go to the server in the
 * context of the data call (R10, R13, R14, R16), and a named range is one period (R17).
 */
export class TimeOffLeaveModel extends EmployeeTimelineModel {
    /**
     * R25: the zone of the browser is in the context of every call the view makes, the writes of a
     * move, a resize and a copy included: the Community reads the start and end the grid shows
     * back into days in that zone, whatever the user's preference zone.
     */
    get context() {
        return { ...this._hhgContext, tz: Settings.defaultZone.name };
    }

    set context(value) {
        this._hhgContext = value;
    }

    /** The framework compares the context of a search with the one it holds: both name the zone. */
    async load(searchParams = {}) {
        const context = { ...searchParams.context, tz: Settings.defaultZone.name };
        return super.load({ ...searchParams, context });
    }

    _request(range, offset) {
        const request = super._request(range, offset);
        request.kwargs.context = {
            ...request.kwargs.context,
            group_by: [...this.groupBy],
            tz: Settings.defaultZone.name,
            // today is the browser's: no value reads the server's clock at run time
            hhg_today: DateTime.now().toISODate(),
        };
        return request;
    }

    /** The first display builds one period too (a named range only; a custom one is 002a's). */
    _firstRange(context) {
        const range = super._firstRange(context);
        return range.kind === "custom" ? range : hhgOnePeriod(range.kind, range.focus);
    }

    /** Choosing a range from the menu (002d2 R6 picks the focus date when none is given). */
    async setKind(kind, focus) {
        this._dropPendingStep();
        const range = hhgOnePeriod(kind, (focus || this._focusForKind(kind)).startOf("day"));
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
        const range = around.kind === "custom" ? around : hhgOnePeriod(around.kind, today);
        await this._reload({ range });
        this.notify();
        return "reloaded";
    }
}
