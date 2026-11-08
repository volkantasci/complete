// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { patch } from "@web/core/utils/patch";
import { WebClient } from "@web/webclient/webclient";

import "@web_enterprise/home_menu/home_menu_action";

// Community calls this hook for an empty start, an unknown action and the in-app
// back on the first screen: all of them land on the home menu (R1).
patch(WebClient.prototype, {
    _loadDefaultApp() {
        return this.actionService.doAction("menu", { clearBreadcrumbs: true });
    },
});
