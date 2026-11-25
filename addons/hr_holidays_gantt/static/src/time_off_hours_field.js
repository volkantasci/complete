// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { floatTimeField, FloatTimeField } from "@web/views/fields/float_time/float_time_field";
import { parseFloatTime } from "@web/views/fields/parsers";

/** R4 point 2: 4 reads "4h", 4.5 reads "4h30" (the minutes with two digits). */
export function hoursText(value) {
    const total = Math.round((Number(value) || 0) * 60);
    const sign = total < 0 ? "-" : "";
    const hours = Math.floor(Math.abs(total) / 60);
    const minutes = Math.abs(total) % 60;
    return `${sign}${hours}h${minutes ? String(minutes).padStart(2, "0") : ""}`;
}

/** The hour line of the leave popover: the hours as "4h" / "4h30"; "4:30" and "4.5" are read too. */
export class TimeOffHoursField extends FloatTimeField {
    get formattedValue() {
        return hoursText(this.value);
    }

    parseValue(value) {
        const match = /^\s*(\d+)\s*h\s*(\d{1,2})?\s*$/i.exec(value);
        if (match) {
            return Number(match[1]) + Number(match[2] || 0) / 60;
        }
        return parseFloatTime(value, this.props.unit);
    }
}

registry.category("fields").add("hhg_hours", { ...floatTimeField, component: TimeOffHoursField });
