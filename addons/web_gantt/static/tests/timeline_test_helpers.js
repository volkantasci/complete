// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach } from "@odoo/hoot";
import {
    allowTranslations,
    defineModels,
    fields,
    getMockEnv,
    getService,
    makeKwArgs,
    makeTestApp,
    models,
    onRpc,
} from "@web/../tests/web_test_helpers";
import { parseXML } from "@web/core/utils/xml";
import { parseTimelineArch } from "@web_gantt/timeline_arch_parser";
import { TimelineModel } from "@web_gantt/timeline_model";

const { DateTime } = luxon;

/**
 * Shared fixtures of the timeline view tests: the mock models of the scratch host, its records
 * (D0 = 2026-11-12, local times at UTC+3 stored as UTC), the `get_gantt_data` handler and the
 * arch helpers. Call `setupTimelineFixtures()` once at the top of a test file.
 */

const D0 = "2026-11-12";
const UTC_OFFSET_HOURS = 3;

/** Server text (UTC) of a local time `days` away from D0. */
export function at(days, clock) {
    const [hour, minute] = clock.split(":").map(Number);
    return DateTime.utc(2026, 11, 12, hour, minute)
        .plus({ days })
        .minus({ hours: UTC_OFFSET_HOURS })
        .toFormat("yyyy-MM-dd HH:mm:ss");
}

/** Server text of a date `days` away from D0. */
export function dayAt(days) {
    return DateTime.fromISO(D0).plus({ days }).toISODate();
}

export const PROPERTY_DEFINITION = {
    name: "color_prop",
    type: "selection",
    string: "Prop",
    selection: [
        ["red", "Red"],
        ["blue", "Blue"],
    ],
};

class Partner extends models.Model {
    _name = "partner";

    name = fields.Char();
    avatar_128 = fields.Binary();

    _records = [
        { id: 1, name: "Host Contact 1" },
        { id: 2, name: "Host Contact 2" },
        { id: 3, name: "Host Contact 3" },
    ];
}

class Tag extends models.Model {
    _name = "tag";

    name = fields.Char();

    _records = [
        { id: 1, name: "Host Tag 1" },
        { id: 2, name: "Host Tag 2" },
    ];
}

class Pill extends models.Model {
    _name = "pill";

    name = fields.Char();
    active = fields.Boolean({ default: true });
    date_start = fields.Datetime();
    date_stop = fields.Datetime();
    parent_id = fields.Many2one({ relation: "pill", string: "Parent" });
    x_color = fields.Integer({ string: "Color" });
    x_progress = fields.Float({ string: "Progress" });
    x_flagged = fields.Boolean({ string: "Flagged" });
    x_done = fields.Boolean({ string: "Done" });
    x_contact = fields.Many2one({ relation: "partner", string: "Contact" });
    x_tags = fields.Many2many({ relation: "tag", string: "Tags" });
    x_state = fields.Selection({
        string: "State",
        selection: [
            ["draft", "Draft"],
            ["doing", "In progress"],
            ["finished", "Finished"],
        ],
    });
    pill_properties = fields.Properties({
        string: "Pill Properties",
        definition_record: "parent_id",
        definition_record_field: "pill_properties_definition",
    });
    pill_properties_definition = fields.PropertiesDefinition();

    _records = (() => {
        const parents = [
            { id: 1, name: "Alpha", pill_properties_definition: [PROPERTY_DEFINITION] },
            { id: 2, name: "Beta" },
            { id: 3, name: "Gamma" },
        ];
        // name, parent, contact, start, stop, colour, progress, tags, extra
        const rows = [
            ["Design", 1, 1, [-3, "09:00"], [-1, "18:00"], 1, 40, [1], { x_state: "draft" }],
            ["Build", 1, 1, [0, "09:00"], [2, "18:00"], 2, 75, [1, 2], { x_state: "doing" }],
            ["Review", 1, 2, [0, "13:00"], [0, "17:00"], 3, 0, [], { x_state: "doing" }],
            ["Test", 2, 2, [1, "08:00"], [4, "12:00"], 4, 0, [], { x_flagged: true }],
            ["Deploy", 2, 3, [5, "08:00"], [6, "18:00"], 5, 0, [], { x_done: true }],
            ["Plan", false, false, [-1, "09:00"], [1, "12:00"], 0, 0, [], {}],
            ["Long task", 3, 3, [-20, "09:00"], [20, "18:00"], 6, 0, [], {}],
            ["Overlap A", 3, 3, [-2, "10:00"], [0, "12:00"], 7, 0, [], {}],
            ["Overlap B", 3, 3, [-1, "14:00"], [1, "12:00"], 8, 0, [], {}],
            ["Overlap C", 3, 3, [0, "08:00"], [2, "18:00"], 9, 0, [], {}],
            ["Color ten", 3, false, [3, "08:00"], [4, "18:00"], 10, 0, [], {}],
            ["Color eleven", 3, false, [-3, "08:00"], [-2, "18:00"], 11, 0, [], {}],
            ["Wrong order", 2, false, [3, "18:00"], [3, "09:00"], 10, 0, [], {}],
            ["Unscheduled", 2, false, null, null, 0, 0, [], {}],
        ];
        return [
            ...parents.map((parent) => ({ active: true, ...parent })),
            ...rows.map(([name, parent, contact, start, stop, color, progress, tags, extra], i) => ({
                id: 4 + i,
                name,
                active: true,
                parent_id: parent,
                x_contact: contact,
                date_start: start ? at(...start) : false,
                date_stop: stop ? at(...stop) : false,
                x_color: color,
                x_progress: progress,
                x_tags: tags,
                ...extra,
            })),
        ];
    })();
}

class Pill2 extends models.Model {
    _name = "pill2";

    name = fields.Char();
    active = fields.Boolean({ default: true });
    date_start = fields.Date();
    date_stop = fields.Date();

    _records = [
        { id: 1, name: "Day one", date_start: dayAt(0), date_stop: dayAt(0), active: true },
        { id: 2, name: "Three days", date_start: dayAt(-1), date_stop: dayAt(1), active: true },
        { id: 3, name: "Next month", date_start: dayAt(25), date_stop: dayAt(40), active: true },
    ];
}

/**
 * State of the `get_gantt_data` mock, reset before each test.
 * - `calls`: the keyword arguments of every call, in order;
 * - `beforeReply(kwargs, index)`: may return a promise that delays the answer;
 * - `expandGroups`: ids of the first level group values to answer even when empty (like a
 *   `group_expand`), or false;
 * - `unavailability`, `progress`: host answers `{field: {id: ...}}`.
 */
export const timelineMock = {
    calls: [],
    beforeReply: null,
    expandGroups: false,
    unavailability: {},
    progress: {},
};

function resetMock() {
    timelineMock.calls = [];
    timelineMock.beforeReply = null;
    timelineMock.expandGroups = false;
    timelineMock.unavailability = {};
    timelineMock.progress = {};
}

function mentionsActive(domain) {
    return JSON.stringify(domain).includes('"active"');
}

/** Values of one grouping for one record (a many-to-many gives one per value). */
function groupValues(server, Model, record, groupby) {
    const [name, property] = groupby.split(".");
    const field = Model._fields[name];
    if (property) {
        const value = record[name]?.[property];
        return [value ?? false];
    }
    const nameOf = (relation, id) => server.env[relation].find((r) => r.id === id).name;
    switch (field.type) {
        case "many2one":
            return [record[name] ? [record[name], nameOf(field.relation, record[name])] : false];
        case "many2many": {
            const ids = record[name] || [];
            return ids.length ? ids.map((id) => [id, nameOf(field.relation, id)]) : [false];
        }
        default:
            return [record[name] ?? false];
    }
}

// The mock orders many2one groups by id (the server uses the comodel order), no value last.
function compareValues(Model, groupby, a, b) {
    if (a === b) {
        return 0;
    }
    const [name, property] = groupby.split(".");
    const type = property ? "char" : Model._fields[name].type;
    if (type === "boolean") {
        return Number(a) - Number(b);
    }
    if (a === false) {
        return 1; // no value goes last, like on the server
    }
    if (b === false) {
        return -1;
    }
    const key = (value) => (Array.isArray(value) ? value[0] : value);
    if (type === "selection") {
        const keys = Model._fields[name].selection.map(([k]) => k);
        return keys.indexOf(a) - keys.indexOf(b);
    }
    return key(a) < key(b) ? -1 : 1;
}

async function getGanttData({ model, kwargs }) {
    const index = timelineMock.calls.length;
    timelineMock.calls.push(JSON.parse(JSON.stringify(kwargs)));
    if (timelineMock.beforeReply) {
        await timelineMock.beforeReply(kwargs, index);
    }
    const Model = this.env[model];
    const domain = kwargs.domain || [];
    const matching = Model.search(
        domain,
        makeKwArgs({ context: { active_test: !mentionsActive(domain) } })
    );
    const order = Array.from(Model, (record) => record.id);
    const sortIds = (ids) => [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const groupby = kwargs.groupby || [];
    let groups;
    let length = 1;
    if (!groupby.length) {
        groups = [{ __record_ids: sortIds(matching) }];
    } else {
        const found = new Map();
        for (const id of sortIds(matching)) {
            const record = Model.find((r) => r.id === id);
            let combos = [[]];
            for (const gb of groupby) {
                const values = groupValues(this, Model, record, gb);
                combos = combos.flatMap((combo) => values.map((value) => [...combo, value]));
            }
            for (const combo of combos) {
                const key = JSON.stringify(combo);
                if (!found.has(key)) {
                    found.set(key, { combo, ids: [] });
                }
                found.get(key).ids.push(id);
            }
        }
        if (timelineMock.expandGroups) {
            const field = Model._fields[groupby[0]];
            const wanted = timelineMock.expandGroups;
            for (const target of Array.from(this.env[field.relation])) {
                if (!wanted.includes(target.id)) {
                    continue;
                }
                const exists = [...found.values()].some(
                    ({ combo }) => Array.isArray(combo[0]) && combo[0][0] === target.id
                );
                if (!exists) {
                    const combo = [[target.id, target.name], ...groupby.slice(1).map(() => false)];
                    found.set(JSON.stringify(combo), { combo, ids: [] });
                }
            }
        }
        const all = [...found.values()].sort((a, b) => {
            for (let i = 0; i < groupby.length; i++) {
                const result = compareValues(Model, groupby[i], a.combo[i], b.combo[i]);
                if (result) {
                    return result;
                }
            }
            return 0;
        });
        length = all.length;
        const from = kwargs.offset || 0;
        const page = kwargs.limit ? all.slice(from, from + kwargs.limit) : all.slice(from);
        groups = page.map(({ combo, ids }) => ({
            ...Object.fromEntries(groupby.map((gb, i) => [gb, combo[i]])),
            __record_ids: ids,
        }));
    }
    const wanted = sortIds(new Set(groups.flatMap((group) => group.__record_ids)));
    const answer = (hooks, asked) =>
        Object.fromEntries((asked || []).map((name) => [name, hooks[name] || {}]));
    return {
        groups,
        records: wanted.length ? Model.web_read(wanted, kwargs.read_specification) : [],
        length,
        unavailabilities: answer(timelineMock.unavailability, kwargs.unavailability_fields),
        progress_bars: answer(timelineMock.progress, kwargs.progress_bar_fields),
    };
}

/** Define the mock models, their records and the server handlers used by timeline tests. */
export function setupTimelineFixtures() {
    defineModels([Partner, Tag, Pill, Pill2]);
    onRpc("get_gantt_data", getGanttData);
    onRpc("get_property_definition", ({ args }) =>
        args[0].endsWith("when_prop")
            ? { name: "when_prop", type: "date", string: "When" }
            : PROPERTY_DEFINITION
    );
    beforeEach(() => {
        allowTranslations();
        resetMock();
    });
}

/** Arch of a timeline view on `pill` or `pill2`. */
export function timelineArch(extraAttrs = "", children = "") {
    return `<gantt date_start="date_start" date_stop="date_stop" ${extraAttrs}>${children}</gantt>`;
}

/** Arches of the scratch host views that do not need an action. */
export const HOST_ARCHS = {
    H1: timelineArch(
        `string="Pills" default_range="week" color="x_color" progress="x_progress"
         decoration-danger="x_flagged" decoration-info="x_done" total_row="1"
         thumbnails="{'x_contact': 'avatar_128'}"`,
        `<field name="x_flagged"/><field name="x_done"/>`
    ),
    H5: timelineArch(),
    H6: timelineArch(
        `string="Pills" default_range="week" pill_label="1" color="x_color"
         display_mode="sparse" groups_limit="2"`
    ),
    H8: timelineArch(`string="Pills" default_range="week" sample="1"`),
    H10: timelineArch(
        `string="Dated pills" default_range="month" scales="day,week,month"
         precision="{'month': 'day:full'}"`
    ),
    H12: timelineArch(
        `string="Pills" default_range="week" color="x_color" progress="x_progress"
         display_unavailability="1" progress_bar="x_contact"`,
        `<field name="x_flagged"/><field name="x_done"/>`
    ),
};

/**
 * Build a model without any UI.
 * @param {Object} [params]
 * @param {string} [params.arch] default: the H1 arch
 * @param {string} [params.resModel]
 * @param {number} [params.viewId]
 * @returns {Promise<{model: TimelineModel, config: Object}>}
 */
export async function makeTimelineModel({
    arch = HOST_ARCHS.H1,
    resModel = "pill",
    viewId = 1,
    fieldsOverride,
} = {}) {
    if (!getMockEnv()) {
        await makeTestApp();
    }
    const orm = getService("orm");
    const modelFields = await orm.call(resModel, "fields_get", []);
    for (const [name, values] of Object.entries(fieldsOverride || {})) {
        modelFields[name] = { ...modelFields[name], ...values };
    }
    const config = parseTimelineArch(parseXML(arch), modelFields);
    const model = new TimelineModel(getMockEnv(), { resModel, fields: modelFields, config, viewId }, { orm });
    return { model, config };
}
