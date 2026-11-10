// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import {
    Component,
    markup,
    onMounted,
    proxy,
    signal,
    t,
    useEffect,
    useListener,
    useOnChange,
    usePlugin,
    useProps,
} from "@odoo/owl";
import { isIosApp as runsOnIosApp } from "@web/core/browser/feature_detection";
import { DebugModePlugin } from "@web/core/debug_mode_plugin";
import { OfflinePlugin } from "@web/core/offline/offline_plugin";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";

import { WIDE_BREAKPOINT, useTileKeyboard } from "@web_enterprise/home_menu/home_menu_keyboard";
import { useTileReorder } from "@web_enterprise/home_menu/home_menu_reorder";
import { orderTiles, readSavedOrder } from "@web_enterprise/home_menu/tile_order";

// Community default application icon (what `load_menus` sends for a menu without an image).
const DEFAULT_ICON = "/web/static/img/default_icon_app.png";
// Height of the top bar: a touch device opens the page scrolled down by this much (R11).
const TOUCH_SCROLL_OFFSET = 46;

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

export class CwsHomeMenu extends Component {
    static template = "web_enterprise.CwsHomeMenu";
    props = useProps({
        apps: t.array(),
        onOpenApp: t.function(),
        onEscape: t.function().optional(),
    });

    setup() {
        this.debugMode = usePlugin(DebugModePlugin);
        this.offline = usePlugin(OfflinePlugin);
        this.state = proxy({
            cursor: null,
            savedOrder: readSavedOrder(user.settings.homemenu_config),
            width: window.innerWidth,
        });
        useListener(window, "resize", () => {
            this.state.width = window.innerWidth;
        });
        this.incomingShare = useService("share_target");
        this.rootRef = signal.ref();
        this.inputRef = signal.ref();
        const { touch } = useTileKeyboard({
            getCount: () => this.tiles.length,
            getFocused: () => this.state.cursor,
            setFocused: (index) => {
                this.state.cursor = index;
            },
            openFocused: () => {
                const app = this.tiles[this.state.cursor];
                if (app) {
                    this.props.onOpenApp(app);
                }
            },
            onEscape: () => (this.props.onEscape || (() => {}))(),
            inputRef: this.inputRef,
        });
        this.isTouch = touch;
        // the tile list changed: nothing is focused any more
        useOnChange(
            () => [this.props.apps, this.state.savedOrder],
            () => {
                this.state.cursor = null;
            },
            { initialRun: false }
        );
        this.reorder = useTileReorder({ ref: this.rootRef, onDrop: (drop) => this.onReorder(drop) });
        // files dropped on the home menu go to the share dialog, when there is one
        useListener(this.rootRef, "dragover", (ev) => this.onFileDrag(ev));
        useListener(this.rootRef, "drop", (ev) => this.onFileDrag(ev));
        // announce the tile list whenever it is (re)built
        useEffect(() => {
            const apps = this.orderedApps.map((app) => ({
                ...app,
                href: tileHref(app),
                label: app.name,
            }));
            this.env.bus.trigger("HOME-MENU:APPS-UPDATED", { apps });
        });
        // keep the focused tile vertically centred
        useEffect(() => {
            const index = this.state.cursor;
            const root = this.rootRef();
            if (index !== null && root) {
                root.querySelectorAll(".o_app")[index]?.scrollIntoView({ block: "center" });
            }
        });
        onMounted(() => {
            if (this.isTouch) {
                this.rootRef().scrollTop = TOUCH_SCROLL_OFFSET;
            }
        });
    }

    /** The applications in display order: the saved order applied to the given list. */
    get orderedApps() {
        return orderTiles(this.props.apps, this.state.savedOrder);
    }

    get tiles() {
        const debugMode = this.debugMode.toString();
        return this.orderedApps.map((app) => ({
            ...app,
            href: tileHref(app, debugMode),
            icon: tileIcon(app),
        }));
    }

    get adminMessage() {
        return readAdminMessage();
    }

    get isIosList() {
        return runsOnIosApp() && this.state.width < WIDE_BREAKPOINT;
    }

    isDimmed(app) {
        return this.offline.isOffline() && !this.offline.isAvailableOffline(app.actionID);
    }

    /**
     * A tile was dropped: show the new order at once, then save it.
     *
     * @param {{ xmlid: string|null, previousXmlid: string|null }} drop
     */
    onReorder({ xmlid, previousXmlid }) {
        if (!xmlid) {
            return;
        }
        const order = this.orderedApps
            .map((app) => app.xmlid)
            .filter((id) => id && id !== xmlid);
        order.splice(order.indexOf(previousXmlid) + 1, 0, xmlid);
        this.state.savedOrder = order;
        this.state.cursor = null;
        const serialized = JSON.stringify(order);
        user.setUserSettings("homemenu_config", serialized);
    }

    /**
     * @param {DragEvent} ev "dragover" or "drop" carrying files
     */
    onFileDrag(ev) {
        const transfer = ev.dataTransfer;
        if (!transfer || ![...(transfer.types || [])].includes("Files")) {
            return;
        }
        // keep the browser from navigating to the dropped file
        ev.preventDefault();
        if (ev.type === "drop" && this.incomingShare.hasShareTargetItems && transfer.files.length) {
            this.incomingShare.display(transfer.files);
        }
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
