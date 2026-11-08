// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, onMounted, onWillUnmount, useProps, xml } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

import { HomeMenu } from "@web_enterprise/home_menu/home_menu";
import "@web_enterprise/home_menu/home_menu_service";

const BODY_CLASS = "o_home_menu_background";

/** The client action `menu`: the home menu as a screen of the action stack. */
export class HomeMenuAction extends Component {
    static displayName = _t("Home");
    static components = { HomeMenu };
    static template = xml`
        <div class="o_cws_home_menu_action">
            <HomeMenu apps="this.apps" onOpenApp="(app) => this.menu.selectMenu(app)" onEscape="() => this.homeMenu.toggle(false)"/>
        </div>`;
    props = useProps();

    setup() {
        this.menu = useService("menu");
        this.homeMenu = useService("home_menu");
        onMounted(() => {
            // `config.breadcrumbs` leaves the home menu out: anything left is behind it
            const hasBackground = this.env.config.breadcrumbs?.length > 0;
            document.body.classList.add(BODY_CLASS);
            this.homeMenu.setShown(true, hasBackground);
        });
        onWillUnmount(() => {
            document.body.classList.remove(BODY_CLASS);
            this.homeMenu.setShown(false, false);
        });
    }

    get apps() {
        return this.menu.getApps().filter((app) => app.actionID);
    }
}

registry.category("actions").add("menu", HomeMenuAction);
