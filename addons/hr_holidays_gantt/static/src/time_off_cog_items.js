// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component } from "@odoo/owl";
import { ImportRecords } from "@base_import/import_records/import_records";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { download } from "@web/core/network/download";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { exprToBoolean } from "@web/core/utils/strings";
import { STATIC_ACTIONS_GROUP_NUMBER } from "@web/search/action_menus/action_menus";

const cogMenuRegistry = registry.category("cogMenu");

/** True for the Gantt view of the time-off requests, opened by a window action, on a desktop. */
function hhgIsLeaveGantt(env) {
    const ui = useService("ui");
    const { actionType, viewType } = env.config;
    const fromWindowAction = actionType === "ir.actions.act_window";
    return (
        !ui.isSmall && fromWindowAction && viewType === "gantt" && env.searchModel.resModel === "hr.leave"
    );
}

/** The view's boolean attribute `name`, true when the arch leaves it out. */
function hhgArchFlag(env, name) {
    return exprToBoolean(env.config.viewArch.getAttribute(name), true);
}

/** The five columns of the export: the request's number, employee, type, start and end. */
function hhgExportFields() {
    return [
        { name: ".id", label: _t("Request"), store: true, type: "integer" },
        { name: "employee_id", label: _t("Employee"), store: true, type: "many2one" },
        { name: "work_entry_type_id", label: _t("Type"), store: true, type: "many2one" },
        { name: "date_from", label: _t("Start"), store: true, type: "datetime" },
        { name: "date_to", label: _t("End"), store: true, type: "datetime" },
    ];
}

/** The "Export" item: downloads the requests of the current search, without any dialog. */
export class HhgExportLeaves extends Component {
    static template = "hr_holidays_gantt.ExportLeaves";
    static components = { DropdownItem };

    async onExport() {
        const { context, domain, resModel } = this.env.searchModel;
        await download({
            url: "/web/export/xlsx",
            data: {
                data: JSON.stringify({
                    import_compat: false,
                    context,
                    domain,
                    fields: hhgExportFields(),
                    groupby: [],
                    ids: false,
                    model: resModel,
                }),
            },
        });
    }
}

export const hhgImportItem = {
    Component: ImportRecords,
    groupNumber: STATIC_ACTIONS_GROUP_NUMBER,
    isDisplayed: (env) =>
        hhgIsLeaveGantt(env) && ["import", "create"].every((name) => hhgArchFlag(env, name)),
};

export const hhgExportItem = {
    Component: HhgExportLeaves,
    groupNumber: STATIC_ACTIONS_GROUP_NUMBER,
    isDisplayed: async (env) =>
        hhgIsLeaveGantt(env) && (await user.hasGroup("base.group_allow_export")),
};

cogMenuRegistry.add("hhg-time-off-import", hhgImportItem, { sequence: 2 });
cogMenuRegistry.add("hhg-time-off-export", hhgExportItem, { sequence: 3 });
