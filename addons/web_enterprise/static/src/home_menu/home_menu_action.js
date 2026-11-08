// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, onMounted, onWillUnmount, useProps, xml } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

import { CwsHomeMenu } from "@web_enterprise/home_menu/home_menu";
import "@web_enterprise/home_menu/home_menu_service";

const BODY_CLASS = "o_home_menu_background";

/** The client action `menu`: the home menu as a screen of the action stack. */
export class CwsHomeScreenAction extends Component {
    static get displayName() {
        return _t("Home");
    }
    static components = { CwsHomeMenu };
    static template = xml`
        <div class="o_cws_home_menu_action">
            <CwsHomeMenu apps="this.apps" onOpenApp="(app) => this.menu.selectMenu(app)" onEscape="() => this.homeSvc.toggle(false)"/>
        </div>`;
    props = useProps();

    setup() {
        this.menu = useService("menu");
        this.homeSvc = useService("home_menu");
        onMounted(() => {
            // `config.breadcrumbs` leaves the home menu out: anything left is behind it
            const hasBackground = this.env.config.breadcrumbs?.length > 0;
            document.body.classList.add(BODY_CLASS);
            this.homeSvc.setShown(true, hasBackground);
        });
        onWillUnmount(() => {
            document.body.classList.remove(BODY_CLASS);
            this.homeSvc.setShown(false, false);
        });
    }

    get apps() {
        return this.menu.getApps().filter((app) => app.actionID);
    }
}

const clientActions = registry.category("actions");
clientActions.add("menu", CwsHomeScreenAction);
