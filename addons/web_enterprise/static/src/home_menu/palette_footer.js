// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, t, useProps } from "@odoo/owl";
import { isMacOS } from "@web/core/browser/feature_detection";

/**
 * Footer of the command palette when opened from the home menu: tells that the
 * palette can be reached from any screen with Control+K (Command+K on Apple computers).
 */
export class PaletteFooter extends Component {
    static template = "web_enterprise.PaletteFooter";
    props = useProps({
        switchNamespace: t.function(),
    });

    setup() {
        this.keyName = isMacOS() ? "COMMAND" : "CONTROL";
    }
}
