// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { BurgerMenu } from "@web/webclient/burger_menu/burger_menu";

import "@web_enterprise/home_menu/home_menu_service";

/** R16: the home menu counts as "no current application". */
export class CwsBurgerMenu extends BurgerMenu {
    setup() {
        super.setup();
        this.menuService = useService("menu");
        this.homeSvc = useService("home_menu");
    }

    get currentApp() {
        return this.homeSvc.hasHomeMenu ? null : this.menuService.getCurrentApp() || null;
    }
}

registry
    .category("systray")
    .add("burger_menu", { Component: CwsBurgerMenu }, { sequence: 0, force: true });
