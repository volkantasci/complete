// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { useService } from "@web/core/utils/hooks";
import { registry } from "@web/core/registry";

const { DateTime } = luxon;

const pad = (value) => String(value).padStart(2, "0");

/**
 * Clock object of one running-time display: the value is a number of seconds
 * (hours, minutes and seconds, hours unbounded) plus a text form.
 */
export class Timer {
    constructor() {
        this.resetTimer();
    }

    /**
     * Zero everything and empty the text.
     */
    resetTimer() {
        this.hours = 0;
        this.minutes = 0;
        this.seconds = 0;
        this.base = 0;
        this.time = "";
    }

    /**
     * @param {number} offsetHours offset in decimal hours, kept as base
     * @param {DateTime} [start] start moment
     * @param {DateTime} [end] end moment (pause moment); "now" when missing
     */
    setTimer(offsetHours, start, end) {
        this.resetTimer();
        this.addFloatTime(offsetHours);
        this.base = this.toSeconds;
        if (start) {
            this._setSeconds(this.base + this.getInterval(start, end || this.getCurrentTime()));
        }
        this.formatTime();
    }

    /**
     * Recompute from the start moment: base plus the time from start to now,
     * so successive ticks never accumulate any drift.
     *
     * @param {DateTime} start
     */
    updateTimer(start) {
        this._setSeconds(this.base + this.getInterval(start, this.getCurrentTime()));
        this.formatTime();
    }

    formatTime() {
        this.time = `${pad(this.hours)}:${pad(this.minutes)}:${pad(this.seconds)}`;
    }

    /**
     * @param {number} hours decimal hours, converted to whole seconds
     */
    addFloatTime(hours) {
        this._setSeconds(this.toSeconds + Math.round((Number(hours) || 0) * 3600));
    }

    get toSeconds() {
        return this.hours * 3600 + this.minutes * 60 + this.seconds;
    }

    get floatValue() {
        return this.toSeconds / 3600;
    }

    /**
     * Whole seconds between two moments, whichever comes first. When `b` is
     * before `a` (the browser clock is behind) the remaining time is rounded
     * up, so it counts down to zero and never shows a negative value.
     *
     * @param {DateTime} a
     * @param {DateTime} b
     * @returns {number}
     */
    getInterval(a, b) {
        const millis = b.toMillis() - a.toMillis();
        return millis >= 0 ? Math.floor(millis / 1000) : Math.ceil(-millis / 1000);
    }

    getCurrentTime() {
        return DateTime.now();
    }

    _setSeconds(total) {
        this.hours = Math.floor(total / 3600);
        this.minutes = Math.floor((total % 3600) / 60);
        this.seconds = total % 60;
    }
}

export const timerService = {
    start() {
        return {
            // a new clock object per call: displays never share one
            createTimer: () => new Timer(),
        };
    },
};

registry.category("services").add("timer", timerService);

/**
 * @returns {Timer} a new clock object owned by the calling component
 */
export function useTimer() {
    return useService("timer").createTimer();
}
