// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, t, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";

/**
 * Start/stop button bound to a yes/no value meaning "a timer is active".
 * It never changes its own state: it calls the server, then reloads the data
 * of the view that contains it.
 */
export class TimerToggleButton extends Component {
    static template = "timer.TimerToggleButton";
    props = useProps({
        name: t.string(),
        record: t.object(),
        context: t.object(),
    });

    setup() {
        this.orm = useService("orm");
    }

    get isRunning() {
        return Boolean(this.props.record.data[this.props.name]);
    }

    get label() {
        return this.isRunning ? _t("Stop") : _t("Start");
    }

    async onClick() {
        const { record, context } = this.props;
        const method = this.isRunning ? "action_timer_stop" : "action_timer_start";
        await this.orm.call(record.resModel, method, [[record.resId]], { context });
        await record.model.load();
    }
}
