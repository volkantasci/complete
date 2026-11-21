// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { TimelineSearchModel } from "@web_gantt/timeline_view";

/** R8: the grouping by Date, by the name the Community's search view gives it. */
export const HHG_HIDDEN_GROUPINGS = ["group_date_from"];

/**
 * The search model of the leave view: the Date grouping is not offered by the menu (a Gantt
 * view cannot be grouped by its own date). A default or a favourite that names it still finds
 * its item, and the view drops the grouping (002a R19).
 */
export class TimeOffLeaveSearchModel extends TimelineSearchModel {
    _enrichItem(searchItem) {
        // a grouping on a date field is of the type "dateGroupBy"
        if (
            ["groupBy", "dateGroupBy"].includes(searchItem.type) &&
            HHG_HIDDEN_GROUPINGS.includes(searchItem.name)
        ) {
            return null;
        }
        return super._enrichItem(searchItem);
    }
}

/** The search model of the report view. */
export class TimeOffReportSearchModel extends TimelineSearchModel {}
