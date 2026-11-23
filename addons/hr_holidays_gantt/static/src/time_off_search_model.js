// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { user } from "@web/core/user";
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

/** R9: from this many readable employees on, the report opens on a narrower search. */
export const HHG_MANY_EMPLOYEES = 50;

/**
 * The search model of the report view (R9). When the view opens, the public employees the user
 * may read are counted: from 50 on, the search starts on My Team (the user's own employee has
 * people under them) or My Department. The count is made once per opening, by `load`; a
 * `reload` keeps what the user's search has become.
 */
export class TimeOffReportSearchModel extends TimelineSearchModel {
    async load(config) {
        const employees = await this.orm.searchCount("hr.employee.public", []);
        if (employees >= HHG_MANY_EMPLOYEES) {
            const subordinates = await this.orm.searchCount("hr.employee.public", [
                ["parent_id", "any", [["user_id", "=", user.userId]]],
            ]);
            const name = subordinates > 0 ? "search_default_my_team" : "search_default_department";
            config = { ...config, context: { [name]: 1, ...config.context } };
        }
        return super.load(config);
    }
}
