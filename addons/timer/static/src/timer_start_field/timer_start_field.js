// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, proxy, t, useEffect, useProps } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { useTimer } from "@timer/timer_service";

/**
 * Live running-time display bound to the timer start of a document.
 *
 * The clock is owned by the instance and recomputed from the start moment
 * every second. It restarts whenever the start, the pause or the offset change.
 */
export class TimerStartField extends Component {
    static template = "timer.TimerStartField";
    props = useProps({
        ...standardFieldProps,
        unitAmountField: t.string().optional(),
    });

    setup() {
        this.timer = useTimer();
        this.state = proxy({ time: "" });
        useEffect(() => {
            const { record, name, unitAmountField } = this.props;
            const start = record.data[name];
            const pause = record.data.timer_pause;
            const offset = unitAmountField ? record.data[unitAmountField] : 0;
            if (!start) {
                this.timer.resetTimer();
                this.state.time = "";
                return;
            }
            this.timer.setTimer(offset || 0, start, pause || undefined);
            this.state.time = this.timer.time;
            if (pause) {
                return;
            }
            const interval = browser.setInterval(() => {
                this.timer.updateTimer(start);
                this.state.time = this.timer.time;
            }, 1000);
            return () => browser.clearInterval(interval);
        });
    }
}

export const timerStartField = {
    component: TimerStartField,
    displayName: _t("Timer"),
    supportedTypes: ["datetime"],
    extractProps: ({ options }) => ({
        unitAmountField: options.unit_amount_field,
    }),
    fieldDependencies: [{ name: "timer_pause", type: "datetime" }],
};

registry.category("fields").add("timer_start_field", timerStartField);
