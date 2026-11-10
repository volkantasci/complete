// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { isIosApp } from "@web/core/browser/feature_detection";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { formView } from "@web/views/form/form_view";
import { cwmSendAccount } from "@web_mobile/account/account_sync";

/**
 * After a successful save of the user record: send the saved name and login to the app and,
 * except inside the iOS app (which does not answer), wait for its answer. Never throws.
 *
 * @param {object} record the saved user record
 */
export async function cwmAfterPrefsSaved(record) {
    try {
        const mobile = record.model.env.services.mobile;
        if (!mobile?.has("updateAccount")) {
            return;
        }
        const data = record.data;
        await cwmSendAccount(
            mobile,
            { name: data.name, login: data.login ?? user.login },
            { wait: !isIosApp() }
        );
    } catch (error) {
        console.warn("[cwm] sending the saved account details failed", error);
    }
}

export class CwmAccountPrefsController extends formView.Controller {
    async onRecordSaved(record) {
        await super.onRecordSaved(...arguments);
        await cwmAfterPrefsSaved(record);
    }
}

registry.category("views").add("cwm_account_prefs_form", {
    ...formView,
    Controller: CwmAccountPrefsController,
});
