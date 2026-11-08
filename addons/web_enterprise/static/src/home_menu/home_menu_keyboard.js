// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onMounted, useListener } from "@odoo/owl";
import { hasTouch } from "@web/core/browser/feature_detection";
import { useService } from "@web/core/utils/hooks";

import { PaletteFooter } from "@web_enterprise/home_menu/palette_footer";
import { nextTileIndex } from "@web_enterprise/home_menu/tile_navigation";

// Below this window width the layout is the narrow one (Bootstrap `md`).
export const WIDE_BREAKPOINT = 768;

const NAVIGATION_KEYS = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Tab"];
const OPEN_DROPDOWN = ".dropdown-menu, .o-dropdown--menu";
const TEXT_ENTRY = "input, textarea, [contenteditable]";

/**
 * Tiles per row currently shown for a window width (R4): 6 from 768 px, else 4.
 *
 * @param {number} [width]
 * @returns {number}
 */
export function rowLengthForWidth(width = window.innerWidth) {
    return width >= WIDE_BREAKPOINT ? 6 : 4;
}

/**
 * Open the command palette in menu-search mode with our footer.
 *
 * @param {{ openMainPalette: Function }} command CE `command` service
 * @param {string} searchValue starts with "/" (menu-search namespace)
 * @param {Function} [onClose] called when the palette closes
 */
export function openMenuPalette(command, searchValue, onClose) {
    command.openMainPalette({ searchValue, FooterComponent: PaletteFooter }, onClose);
}

/**
 * Keyboard handling of the home menu: tile navigation, refocus of the search field
 * and type-to-search through the command palette (R9, R10, R11).
 *
 * Keyboard handling is decided once, when the component mounts: it needs a window of
 * 768 px or more, on any device (R10); touch only skips the focus at opening (R10, R11). The field handlers (typing, click) always apply,
 * since the field is visible on touch devices.
 *
 * @param {Object} params
 * @param {() => number} params.getCount number of tiles
 * @param {() => (number|null)} params.getFocused focused tile index
 * @param {(index: number|null) => void} params.setFocused
 * @param {() => void} params.openFocused open the focused tile
 * @param {() => void} params.onEscape
 * @param {() => (HTMLInputElement|null)} params.inputRef the search field
 * @returns {{ enabled: boolean, touch: boolean }}
 */
export function useTileKeyboard({
    getCount,
    getFocused,
    setFocused,
    openFocused,
    onEscape,
    inputRef,
}) {
    const ui = useService("ui");
    const command = useService("command");
    const touch = hasTouch();
    // R10: width alone enables keyboard handling; touch only skips the focus at mount.
    const enabled = window.innerWidth >= WIDE_BREAKPOINT;

    const focusField = () => {
        const field = inputRef();
        if (field && document.activeElement !== field) {
            field.focus({ preventScroll: true });
        }
    };

    // true when something else (overlay, dropdown, text entry) keeps the keys
    const isKeyLeftAlone = () => {
        if (ui.activeElement !== document) {
            return true;
        }
        const active = document.activeElement;
        if (document.querySelector(".o-dropdown--menu") || active?.closest?.(OPEN_DROPDOWN)) {
            return true;
        }
        return (
            active !== inputRef() &&
            Boolean(active?.matches?.(TEXT_ENTRY) || active?.isContentEditable)
        );
    };

    const openPalette = (searchValue) => {
        openMenuPalette(command, searchValue, enabled ? focusField : undefined);
        const field = inputRef();
        if (field) {
            field.value = "";
        }
    };

    useListener(inputRef, "input", (ev) => {
        const field = inputRef();
        openPalette(ev.isComposing ? "/" : "/" + field.value.trim());
    });
    useListener(inputRef, "click", () => openPalette("/"));

    if (enabled) {
        onMounted(() => {
            if (!touch) {
                inputRef()?.focus({ preventScroll: true });
            }
        });
        useListener(document, "keydown", (ev) => {
            if (ev.ctrlKey || ev.metaKey || ev.altKey || isKeyLeftAlone()) {
                return;
            }
            if (NAVIGATION_KEYS.includes(ev.key)) {
                ev.preventDefault();
                const key = ev.key === "Tab" && ev.shiftKey ? "Shift+Tab" : ev.key;
                setFocused(nextTileIndex(key, getFocused(), getCount(), rowLengthForWidth()));
            } else if (ev.key === "Enter" && getFocused() !== null) {
                ev.preventDefault();
                openFocused();
            } else if (ev.key === "Escape") {
                onEscape();
            } else {
                focusField();
            }
        });
        // a click on an inert area parks the focus on the body: take it back
        useListener(document, "click", () => {
            if (document.activeElement === document.body && !isKeyLeftAlone()) {
                focusField();
            }
        });
    }
    return { enabled, touch };
}
