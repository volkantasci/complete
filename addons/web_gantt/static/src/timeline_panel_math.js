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

/**
 * The span a line of the panel covers over the grid (002b3 R21.3): one column's length, that is
 * `partsPerColumn` sub-columns, its first one the sub-column under the pointer moved back by
 * round(p / 2) - 1 (p = 1 or 2: the sub-column under the pointer; p = 4: the one before it), kept
 * inside the grid with its length when it can be.
 * @param {Object} params
 * @param {number} params.part the sub-column under the pointer
 * @param {number} params.partsPerColumn
 * @param {number} params.gridParts the number of sub-columns of the grid
 * @returns {{from: number, to: number}} first and last sub-column
 */
export function panelSpan({ part, partsPerColumn, gridParts }) {
    const length = Math.max(partsPerColumn, 1);
    const wanted = part - (Math.round(length / 2) - 1);
    const from = Math.min(Math.max(wanted, 0), Math.max(gridParts - length, 0));
    return { from, to: Math.min(from + length - 1, Math.max(gridParts - 1, 0)) };
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

const ALWAYS_TRUE = "true";
const ALWAYS_FALSE = "false";
const isConstant = (side) => side === ALWAYS_TRUE || side === ALWAYS_FALSE;

/**
 * The tree without the conditions on `fields` (002b3 R19.1, decision D5): a condition on them
 * becomes "always true" (in an "and", at the top level) or "always false" (directly under an
 * "or"); a negation around one condition goes with it and is replaced as that condition would
 * be; a negation around a group applies to what is left of the group, and goes too when nothing
 * is left; an "or" whose two sides are both left out is "always true". What comes back is a tree
 * or one of the two constants, which the parent folds away.
 * @param {Object|Array} node
 * @param {string[]} fields
 * @param {string} under the operator directly above: "&", "|", "!" or "" at the top level
 */
function stripTree(node, fields, under) {
    const outcome = under === "|" ? ALWAYS_FALSE : ALWAYS_TRUE;
    if (!node.op) {
        return isOnFields(node, fields) ? outcome : node;
    }
    if (node.op === "!") {
        const inner = stripTree(node.args[0], fields, "!");
        return isConstant(inner) ? outcome : { op: "!", args: [inner] };
    }
    const [left, right] = node.args.map((arg) => stripTree(arg, fields, node.op));
    if (node.op === "&") {
        if (left === ALWAYS_FALSE || right === ALWAYS_FALSE) {
            return ALWAYS_FALSE;
        }
        if (isConstant(left) || isConstant(right)) {
            return isConstant(left) ? right : left;
        }
        return { op: "&", args: [left, right] };
    }
    if (left === ALWAYS_TRUE || right === ALWAYS_TRUE) {
        return ALWAYS_TRUE;
    }
    if (left === ALWAYS_FALSE && right === ALWAYS_FALSE) {
        return ALWAYS_TRUE; // an "or" of two conditions that are both left out
    }
    if (left === ALWAYS_FALSE) {
        return right;
    }
    return right === ALWAYS_FALSE ? left : { op: "|", args: [left, right] };
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
 * that stays valid, by the rules of `stripTree` (the Community's `Domain.removeDomainLeaves`
 * turns a negated condition into "never", which would empty the list of the records to schedule).
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
        const node = stripTree(parseTree(items, at), [startField, stopField], "");
        if (node !== ALWAYS_TRUE) {
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
