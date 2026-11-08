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
        this.homeMenu = useService("home_menu");
    },

    /** The home menu is shown over an application: the grid button goes back. */
    get hasBackChevron() {
        return this.homeMenu.hasHomeMenu && this.homeMenu.hasBackgroundAction;
    },

    /** The home menu is shown with nothing behind it: nothing to go back to. */
    get isGridButtonHidden() {
        return this.homeMenu.hasHomeMenu && !this.homeMenu.hasBackgroundAction;
    },

    /** The application icon, name, sections and breadcrumbs leave the bar over the home menu. */
    get isAppChromeHidden() {
        return this.homeMenu.hasHomeMenu;
    },

    /** The brand is replaced by the scoped link, which carries the name itself. */
    get isBrandHidden() {
        return this.isAppChromeHidden || (!this.ui.isSmall && this.isScopedApp);
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
        return this.homeMenu.toggle();
    },

    // Mobile: inside an application the toggle opens the sidebar; over the home menu
    // it brings the application back.
    _openAppMenuSidebar() {
        if (this.homeMenu.hasHomeMenu) {
            if (this.homeMenu.hasBackgroundAction) {
                return this.homeMenu.toggle(false);
            }
            return;
        }
        return super._openAppMenuSidebar(...arguments);
    },

    async onAllAppsBtnClick() {
        await this.homeMenu.toggle(true);
        this._closeAppMenuSidebar();
    },
});
