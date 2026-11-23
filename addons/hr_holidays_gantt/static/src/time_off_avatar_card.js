// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { AvatarCard } from "@mail/core/web/avatar_card/avatar_card";
import { onMounted, onWillStart, signal, t, useProps } from "@odoo/owl";
import { useDateTimePicker } from "@web/core/datetime/datetime_picker_hook";
import { serializeDate } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { formatFloat } from "@web/views/fields/formatters";

const PUBLIC_MODEL = "hr.employee.public";

/** R18 point 3: the dashboard's scale by the kind of the view's range; the year by default. */
export function dashboardScale(rangeKind) {
    return rangeKind === "week" || rangeKind === "month" ? rangeKind : "year";
}

/**
 * The employee card of the time-off views (R18): the Community card without its footer, and a
 * leave band under its body with the schedule button, the pencil and the summary lines.
 */
export class TimeOffAvatarCard extends AvatarCard {
    static template = "hr_holidays_gantt.TimeOffAvatarCard";

    scheduleRef = signal.ref();
    versionRef = signal.ref();

    setup() {
        super.setup();
        // the card's own `props` keep the three keys it declares; this one reads the range kind
        this.hhgProps = useProps({ rangeKind: t.string().optional() });
        this.orm = useService("orm");
        this.hhgAction = useService("action");
        this.hhgSummary = [];
        this.hhgHours = 0;
        this.hhgIsOfficer = false;
        onWillStart(async () => {
            const [[card], isOfficer] = await Promise.all([
                this.orm.read(PUBLIC_MODEL, [this.props.id], [
                    "avatar_leave_summary",
                    "avatar_hours_per_week",
                ]),
                user.hasGroup("hr.group_hr_user"),
            ]);
            this.hhgSummary = card?.avatar_leave_summary || [];
            this.hhgHours = card?.avatar_hours_per_week || 0;
            this.hhgIsOfficer = Boolean(isOfficer);
        });
        onMounted(() => this.scheduleRef()?.focus());
        this.versionPicker = useDateTimePicker({
            target: this.versionRef,
            onApply: (date) => {
                if (date) {
                    this.onVersionDate(date);
                }
            },
            get pickerProps() {
                return { type: "date" };
            },
        });
    }

    /** The card's footer is gone (R18). */
    get hasFooter() {
        return false;
    }

    /** R18 point 3: the stored number as it is, the digits it has and no more ("37.5", "40"). */
    get scheduleLabel() {
        const hours = formatFloat(this.hhgHours, { digits: [0, 14], trailingZeros: false });
        return this.hhgHours
            ? _t("%(hours)s h / Week", { hours })
            : _t("Time Off");
    }

    /** The lines of the summary, texts ready for the template. */
    get summaryLines() {
        return this.hhgSummary.map((entry) => ({
            name: entry.name,
            taken: this.amount(entry.taken, entry.unit),
            left: entry.requires_allocation ? this.amount(entry.left, entry.unit) : null,
        }));
    }

    amount(value, unit) {
        const text = formatFloat(value, { trailingZeros: false });
        if (unit === "hours") {
            return Math.abs(value) === 1
                ? _t("%(amount)s hour", { amount: text })
                : _t("%(amount)s hours", { amount: text });
        }
        return Math.abs(value) === 1
            ? _t("%(amount)s day", { amount: text })
            : _t("%(amount)s days", { amount: text });
    }

    onPencilClick() {
        this.versionPicker.open();
    }

    async onScheduleClick() {
        const action = await this.orm.call(
            PUBLIC_MODEL,
            "hhg_open_leave_dashboard",
            [[this.props.id]],
            { scale: dashboardScale(this.hhgProps.rangeKind) }
        );
        this.props.close();
        await this.hhgAction.doAction(action);
    }

    /** R18 point 4: a version of the employee from the picked date, then the form on it. */
    async onVersionDate(date) {
        const versionId = await this.orm.call("hr.employee", "create_version", [
            [this.props.id],
            { date_version: serializeDate(date) },
        ]);
        this.props.close();
        await this.hhgAction.doAction({
            type: "ir.actions.act_window",
            res_model: "hr.employee",
            res_id: this.props.id,
            views: [[false, "form"]],
            context: { version_id: versionId },
        });
    }
}
