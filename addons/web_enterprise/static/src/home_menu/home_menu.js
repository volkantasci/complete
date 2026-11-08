// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, markup, proxy, t, useListener, usePlugin, useProps } from "@odoo/owl";
import { isIosApp } from "@web/core/browser/feature_detection";
import { DebugModePlugin } from "@web/core/debug_mode_plugin";
import { OfflinePlugin } from "@web/core/offline/offline_plugin";
import { user } from "@web/core/user";
import { session } from "@web/session";

import { orderTiles, readSavedOrder } from "@web_enterprise/home_menu/tile_order";

// Community default application icon (what `load_menus` sends for a menu without an image).
const DEFAULT_ICON = "/web/static/img/default_icon_app.png";
// Below this window width the layout is the narrow one (Bootstrap `md`).
const WIDE_BREAKPOINT = 768;

/**
 * Address a tile links to: the action path (or the action id) under /odoo,
 * with the debug mode appended when it is active.
 *
 * @param {{ actionPath?: string, actionID?: number }} app
 * @param {string|{ toString(): string }} [debugMode]
 * @returns {string}
 */
export function tileHref(app, debugMode) {
    const url = `/odoo/${app.actionPath || "action-" + app.actionID}`;
    const mode = debugMode ? String(debugMode) : "";
    return mode ? `${url}?debug=${mode}` : url;
}

/**
 * Describe how a tile draws its icon: the menu image when there is one, a glyph
 * when `webIcon` is "glyph,colour,background", else the default application icon.
 *
 * @param {{ webIcon?: string|false, webIconData?: string|false }} app
 */
export function tileIcon(app) {
    if (app.webIconData) {
        return { kind: "image", src: app.webIconData };
    }
    if (typeof app.webIcon === "string") {
        const parts = app.webIcon.split(",");
        if (parts.length === 3 && parts.every((part) => part.trim())) {
            const [glyph, color, background] = parts;
            return { kind: "glyph", glyph, color, background };
        }
    }
    return { kind: "default", src: DEFAULT_ICON };
}

/**
 * The administrator message to show, as markup, or null when nothing is shown.
 * Anything unexpected shows nothing.
 */
function readAdminMessage() {
    const data = session.sysadmin_message;
    if (!data || typeof data !== "object" || typeof data.message !== "string") {
        return null;
    }
    if (!data.message.trim()) {
        return null;
    }
    const allowed =
        data.warning_type === "user" || (data.warning_type === "admin" && user.isSystem);
    return allowed ? markup(data.message) : null;
}

export class HomeMenu extends Component {
    static template = "web_enterprise.HomeMenu";
    props = useProps({
        apps: t.array(),
        onOpenApp: t.function(),
    });

    setup() {
        this.debugMode = usePlugin(DebugModePlugin);
        this.offline = usePlugin(OfflinePlugin);
        this.state = proxy({
            focusedIndex: null,
            width: window.innerWidth,
        });
        useListener(window, "resize", () => {
            this.state.width = window.innerWidth;
        });
    }

    get tiles() {
        const debugMode = this.debugMode.toString();
        const saved = readSavedOrder(user.settings.homemenu_config);
        return orderTiles(this.props.apps, saved).map((app) => ({
            ...app,
            href: tileHref(app, debugMode),
            icon: tileIcon(app),
        }));
    }

    get adminMessage() {
        return readAdminMessage();
    }

    get isIosList() {
        return isIosApp() && this.state.width < WIDE_BREAKPOINT;
    }

    isDimmed(app) {
        return this.offline.isOffline() && !this.offline.isAvailableOffline(app.actionID);
    }

    /**
     * @param {MouseEvent} ev
     * @param {Object} app
     */
    onTileClick(ev, app) {
        // let the browser handle new-tab clicks; plain clicks stay in the page
        if (ev.button || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) {
            return;
        }
        ev.preventDefault();
        this.props.onOpenApp(app);
    }
}
