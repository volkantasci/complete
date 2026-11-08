// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Read the saved tile order from a user setting.
 *
 * The setting is JSON text, or an already decoded list. Anything else (invalid
 * JSON, a value that is not a list, a missing value) means "no saved order".
 * Entries that are not strings are dropped.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
export function readSavedOrder(raw) {
    let value = raw;
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry) => typeof entry === "string");
}

/**
 * Arrange application tiles: the applications missing from the saved order come
 * first in their given order, the saved ones follow in the saved order.
 * Unknown identifiers are ignored and a repeated identifier counts once.
 *
 * @param {{ xmlid: string }[]} apps
 * @param {string[]} savedOrder
 * @returns {{ xmlid: string }[]}
 */
export function orderTiles(apps, savedOrder) {
    const byXmlid = new Map();
    for (const app of apps) {
        if (app.xmlid && !byXmlid.has(app.xmlid)) {
            byXmlid.set(app.xmlid, app);
        }
    }
    const listed = [];
    const seen = new Set();
    for (const xmlid of savedOrder || []) {
        if (typeof xmlid === "string" && byXmlid.has(xmlid) && !seen.has(xmlid)) {
            seen.add(xmlid);
            listed.push(byXmlid.get(xmlid));
        }
    }
    const unlisted = apps.filter((app) => !app.xmlid || !seen.has(app.xmlid));
    return [...unlisted, ...listed];
}
