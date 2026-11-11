// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, t, useProps } from "@odoo/owl";

const { DateTime } = luxon;

/**
 * Minimal renderer: column group headers, column headers and an empty grid body.
 * Task 10 replaces it with the full grid; the props are the contract.
 */
export class TimelineRenderer extends Component {
    static template = "web_gantt.TimelineRenderer";
    props = useProps({
        model: t.object(),
        archInfo: t.object(),
    });

    get data() {
        return this.props.model.data;
    }

    columnLabel(column) {
        switch (this.data.scaleId) {
            case "day":
                return String(column.start.hour);
            case "week":
                return column.start.toFormat("cccc d");
            case "month":
                return column.start.toFormat("dd");
            default:
                return column.start.toLocaleString({ month: "long" });
        }
    }

    columnTitle(column) {
        const format = this.data.scaleId === "year" ? { month: "long", year: "numeric" } : DateTime.DATE_FULL;
        return column.start.toLocaleString(format);
    }
}
