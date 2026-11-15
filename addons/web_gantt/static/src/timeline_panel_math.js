// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Domain } from "@web/core/domain";

const OPERATORS = ["&", "|", "!"];

/** The narrowest the side panel gets when it is resized, in pixels (002b3 R20). */
export const PANEL_MIN_WIDTH = 150;

/**
 * The width of the panel while its strip is dragged (002b3 R20): the width at the press minus the
 * pointer's horizontal move, never below 150 px and never above the larger of half the window and
 * the width at the press.
 * @param {number} startWidth
 * @param {number} dx pointer move since the press, negative to the left
 * @param {number} windowWidth
 * @returns {number}
 */
export function clampPanelWidth(startWidth, dx, windowWidth) {
    return Math.min(
        Math.max(startWidth - dx, PANEL_MIN_WIDTH),
        Math.max(windowWidth / 2, startWidth)
    );
}

/** Whether `leaf` constrains `field` or a field reached through it (`date_start`, `date_start.x`). */
function isOnFields(leaf, fields) {
    const path = String(leaf[0]);
    return fields.some((field) => path === field || path.startsWith(`${field}.`));
}

/** The prefix list `items` as a tree: `{op, args}` for an operator, the leaf itself otherwise. */
function parseTree(items, at) {
    const item = items[at.i++];
    if (OPERATORS.includes(item)) {
        const args = [parseTree(items, at)];
        if (item !== "!") {
            args.push(parseTree(items, at));
        }
        return { op: item, args };
    }
    return item;
}

/** The tree without the conditions on `fields`; null when nothing is left of it. */
function stripTree(node, fields) {
    if (!node.op) {
        return isOnFields(node, fields) ? null : node;
    }
    const args = node.args.map((arg) => stripTree(arg, fields));
    if (node.op === "!") {
        // the negation of a condition left out leaves out the whole negation
        return args[0] ? { op: "!", args } : null;
    }
    // a left-out side leaves the other side alone, in an "and" as in an "or"
    if (!args[0] || !args[1]) {
        return args[0] || args[1];
    }
    return { op: node.op, args };
}

function flatten(node, out) {
    if (!node.op) {
        out.push(node);
        return;
    }
    out.push(node.op);
    node.args.forEach((arg) => flatten(arg, out));
}

/**
 * The domain without every condition on the start or the stop field (002b3 R19), as a list
 * that stays valid: a condition left out of an `&` or `|` leaves its sibling; the negation of a
 * condition left out is left out as a whole (the Community's `Domain.removeDomainLeaves` turns it
 * into "never", which would empty the list of the records to schedule).
 * @param {Array|string|Domain} domain
 * @param {string} startField
 * @param {string} stopField
 * @returns {Array}
 */
export function stripDateConditions(domain, startField, stopField) {
    const items = new Domain(domain).toList();
    const at = { i: 0 };
    const kept = [];
    while (at.i < items.length) {
        const node = stripTree(parseTree(items, at), [startField, stopField]);
        if (node) {
            kept.push(node);
        }
    }
    const result = [];
    // the top level items are combined by "and": each kept tree follows the next one's operator
    kept.forEach((node, index) => {
        if (index < kept.length - 1) {
            result.push("&");
        }
        flatten(node, result);
    });
    return result;
}
