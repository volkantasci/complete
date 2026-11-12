// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, test } from "@odoo/hoot";
import { allowTranslations } from "@web/../tests/web_test_helpers";
import { parseXML } from "@web/core/utils/xml";

import { parseTimelineArch } from "@web_gantt/timeline_arch_parser";

describe.current.tags("headless");

beforeEach(() => allowTranslations());

const FIELDS = {
    date_start: { type: "datetime" },
    date_stop: { type: "datetime" },
    x_flagged: { type: "boolean" },
    x_done: { type: "boolean" },
    x_contact: { type: "many2one", relation: "partner" },
    allocated_hours: { type: "float" },
};
const parse = (attrs, children = "", fields = FIELDS) =>
    parseTimelineArch(
        parseXML(
            `<gantt date_start="date_start" date_stop="date_stop" ${attrs}>${children}</gantt>`
        ),
        fields
    );

test("defaults", () => {
    const config = parse("", "", {});
    expect(config.title).toBe("Timeline");
    expect(config.startField).toBe("date_start");
    expect(config.defaultKind).toBe(null);
    expect(config.offeredKinds).toEqual(["day", "week", "month", "quarter", "year"]);
    expect(config.displayMode).toBe("dense");
    expect(config.groupsLimit).toBe(null);
    expect(config.totalRow).toBe(false);
    expect(config.computedLabel).toBe(false);
    expect([config.canCreate, config.canEdit, config.canDelete]).toEqual([true, true, true]);
    expect(config.popover).toBe(null);
    expect(config.extraFieldNames).toEqual([]);
});

test("every option is read", () => {
    const config = parse(
        `string="Pills" default_range="quarter" scales="week,month" color="x_contact"
         progress="x_flagged" pill_label="1" display_mode="sparse" total_row="1"
         progress_bar="x_contact, x_done" display_unavailability="1" groups_limit="5"
         create="0" delete="false" sample="1" default_group_by="x_contact"
         thumbnails="{'x_contact': 'avatar_128'}" precision="{'month': 'day:full'}"
         decoration-danger="x_flagged and not x_done" decoration-info="x_done"`,
        `<field name="x_contact"/>`
    );
    expect(config.title).toBe("Pills");
    expect(config.defaultKind).toBe("quarter");
    expect(config.offeredKinds).toEqual(["week", "month", "quarter"]);
    expect(config.colorField).toBe("x_contact");
    expect(config.progressField).toBe("x_flagged");
    expect(config.computedLabel).toBe(true);
    expect(config.displayMode).toBe("sparse");
    expect(config.totalRow).toBe(true);
    expect(config.progressBarFields).toEqual(["x_contact", "x_done"]);
    expect(config.showUnavailability).toBe(true);
    expect(config.groupsLimit).toBe(5);
    expect([config.canCreate, config.canEdit, config.canDelete]).toEqual([false, true, false]);
    expect(config.sample).toBe(true);
    expect(config.defaultGroupBy).toEqual(["x_contact"]);
    expect(config.thumbnails).toEqual({ x_contact: "avatar_128" });
    expect(config.precision).toEqual({ month: "day:full" });
    expect(config.decorations.danger).toBe("x_flagged and not x_done");
    expect(config.decorations.warning).toBe(null);
    expect([...config.extraFieldNames].sort()).toEqual([
        "allocated_hours",
        "x_contact",
        "x_done",
        "x_flagged",
    ]);
});

test("old default_scale values", () => {
    expect(parse(`default_scale="month"`).defaultKind).toBe("month");
    expect(parse(`default_scale="week_2"`).defaultKind).toBe(null);
    expect(parse(`default_scale="month_3"`).defaultKind).toBe(null);
    expect(parse(`default_scale="week_2" default_range="day"`).defaultKind).toBe("day");
});

test("popover", () => {
    const config = parse(
        "",
        `<popover card_id="7">
            <field name="x_contact"/>
            <templates>
                <t t-name="popover-body"><field name="x_done"/></t>
                <t t-name="popover-footer"/>
            </templates>
        </popover>`,
        {}
    );
    expect(config.popover.cardId).toBe("7");
    expect(config.popover.fields).toEqual(["x_contact", "x_done"]);
    expect(Object.keys(config.popover.templates)).toEqual(["popover-body", "popover-footer"]);
    expect(config.extraFieldNames).toEqual(["x_contact", "x_done"]);
});

test("a missing start or stop field is refused", () => {
    expect(() => parseTimelineArch(parseXML(`<gantt date_stop="b"/>`), {})).toThrow(
        /start field/
    );
    expect(() => parseTimelineArch(parseXML(`<gantt date_start="a"/>`), {})).toThrow(
        /stop field/
    );
});
