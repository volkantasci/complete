// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { NavBar } from "@web/webclient/navbar/navbar";

import "@web_enterprise/home_menu/home_menu_service";

const SCOPED_PREFIX = "/scoped_app";

patch(NavBar.prototype, {
    setup() {
        super.setup(...arguments);
        this.homeSvc = useService("home_menu");
    },

    /** Glyph name of the current application, for the font icon. */
    get appGlyphName() {
        return this.currentApp?.webIconClass;
    },

    /** The home menu is shown over an application: the grid button goes back. */
    get hasBackChevron() {
        return this.homeSvc.hasHomeMenu && this.homeSvc.hasBackgroundAction;
    },

    /** The home menu is shown with nothing behind it: nothing to go back to. */
    get isGridButtonHidden() {
        return this.homeSvc.hasHomeMenu && !this.homeSvc.hasBackgroundAction;
    },

    /** The application icon, name, sections and breadcrumbs leave the bar over the home menu. */
    get isAppChromeHidden() {
        return this.homeSvc.hasHomeMenu;
    },

    get gridButtonTitle() {
        return this.hasBackChevron ? _t("Previous view") : _t("Home menu");
    },

    /** Start address of the single-application web app (ruling R-O9). */
    get scopedAppHref() {
        const startUrl = this.pwa.startUrl;
        if (startUrl && startUrl.startsWith(SCOPED_PREFIX)) {
            return startUrl;
        }
        const [, root, app] = window.location.pathname.split("/");
        return app ? `/${root}/${app}` : window.location.pathname;
    },

    onGridButtonClick() {
        return this.homeSvc.toggle();
    },

    // Mobile: inside an application the toggle opens the sidebar; over the home menu
    // it brings the application back.
    _openAppMenuSidebar() {
        if (this.homeSvc.hasHomeMenu) {
            if (this.homeSvc.hasBackgroundAction) {
                return this.homeSvc.toggle(false);
            }
            return;
        }
        return super._openAppMenuSidebar(...arguments);
    },

    async onAllAppsBtnClick() {
        await this.homeSvc.toggle(true);
        this._closeAppMenuSidebar();
    },
});
