// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";
import { tokenize } from "@web/core/py_js/py";
import { exprToBoolean } from "@web/core/utils/strings";
import { visitXML } from "@web/core/utils/xml";
import { getActiveActions } from "@web/views/utils";
import { offeredKinds, TIMELINE_KINDS } from "./timeline_dates";

const DECORATIONS = ["danger", "warning", "success", "info", "secondary"];
const OLD_SCALE_KINDS = ["day", "week", "month", "year"];

/** Read a python-dict-like attribute (`{'a': 'b'}`) into an object; unusable text gives `{}`. */
function parseMapping(text) {
    if (!text) {
        return {};
    }
    for (const candidate of [text, text.replace(/'/g, '"')]) {
        try {
            const value = JSON.parse(candidate);
            if (value && typeof value === "object" && !Array.isArray(value)) {
                return value;
            }
        } catch {
            // try the next spelling
        }
    }
    return {};
}

/** @returns {string[]} the names of the fields an expression reads */
function namesInExpression(expression, fields) {
    try {
        return tokenize(expression)
            .filter((token) => token.type === 3 && token.value in fields)
            .map((token) => token.value);
    } catch {
        return [];
    }
}

function splitNames(text) {
    return (text || "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
}

/** The older `default_scale` names a range, except the two-week and three-month values. */
function defaultKindOf(node) {
    const range = node.getAttribute("default_range");
    if (TIMELINE_KINDS.includes(range)) {
        return range;
    }
    const scale = node.getAttribute("default_scale");
    return OLD_SCALE_KINDS.includes(scale) ? scale : null;
}

/** The `on_create` text: a number when it is all digits (an action id), else the text itself. */
function onCreateOf(text) {
    const value = (text || "").trim();
    if (!value) {
        return null;
    }
    return /^\d+$/.test(value) ? parseInt(value, 10) : value;
}

function parsePopover(node, extraNames) {
    const popover = { fields: [], templates: {}, cardId: node.getAttribute("card_id") || null };
    const addField = (name) => {
        if (name && !popover.fields.includes(name)) {
            popover.fields.push(name);
        }
        if (name) {
            extraNames.add(name);
        }
    };
    for (const child of node.children) {
        if (child.tagName === "field") {
            addField(child.getAttribute("name"));
        } else if (child.tagName === "templates") {
            for (const template of child.children) {
                const name = template.getAttribute("t-name");
                if (name) {
                    popover.templates[name] = template;
                }
            }
            visitXML(child, (inner) => {
                if (inner.tagName === "field") {
                    addField(inner.getAttribute("name"));
                }
            });
        }
    }
    return popover;
}

/**
 * Turn the arch of a timeline view into the configuration the model and the renderer read.
 * @param {Element|Document} xmlDoc
 * @param {Object} fields field descriptions of the model
 */
export function parseTimelineArch(xmlDoc, fields = {}) {
    const root = xmlDoc.documentElement || xmlDoc;
    const attr = (name) => root.getAttribute(name);
    const startField = attr("date_start");
    const stopField = attr("date_stop");
    if (!startField) {
        throw new Error(_t("The Gantt view needs a start field (date_start).").toString());
    }
    if (!stopField) {
        throw new Error(_t("The Gantt view needs a stop field (date_stop).").toString());
    }
    const defaultKind = defaultKindOf(root);
    const decorations = {};
    const extraNames = new Set();
    for (const name of DECORATIONS) {
        const expression = attr(`decoration-${name}`) || null;
        decorations[name] = expression;
        if (expression) {
            namesInExpression(expression, fields).forEach((field) => extraNames.add(field));
        }
    }
    const colorField = attr("color") || null;
    const progressField = attr("progress") || null;
    for (const name of [colorField, progressField]) {
        if (name) {
            extraNames.add(name);
        }
    }
    if ("allocated_hours" in fields) {
        extraNames.add("allocated_hours");
    }
    let popover = null;
    for (const node of root.children) {
        if (node.tagName === "field" && node.getAttribute("name")) {
            extraNames.add(node.getAttribute("name"));
        } else if (node.tagName === "popover" && !popover) {
            popover = parsePopover(node, extraNames);
        }
    }
    const displayMode = attr("display_mode") === "sparse" ? "sparse" : "dense";
    const limit = parseInt(attr("groups_limit"), 10);
    const activeActions = getActiveActions(root);
    return {
        title: attr("string") || _t("Timeline").toString(),
        startField,
        stopField,
        defaultKind,
        offeredKinds: offeredKinds(attr("scales"), defaultKind),
        precision: parseMapping(attr("precision")),
        colorField,
        decorations,
        progressField,
        computedLabel: Boolean(attr("pill_label")),
        thumbnails: parseMapping(attr("thumbnails")),
        displayMode,
        totalRow: exprToBoolean(attr("total_row"), false),
        progressBarFields: splitNames(attr("progress_bar")),
        showUnavailability: exprToBoolean(attr("display_unavailability"), false),
        groupsLimit: limit > 0 ? limit : null,
        canCreate: activeActions.create,
        canEdit: activeActions.edit,
        canDelete: activeActions.delete,
        canCellCreate: activeActions.create && exprToBoolean(attr("cell_create"), true),
        canPlan: activeActions.edit && exprToBoolean(attr("plan"), true),
        popover,
        extraFieldNames: [...extraNames],
        // read by the controller and the model
        sample: exprToBoolean(attr("sample"), false),
        defaultGroupBy: splitNames(attr("default_group_by")),
        formViewId: parseInt(attr("form_view_id"), 10) || false,
        onCreate: onCreateOf(attr("on_create")),
    };
}
