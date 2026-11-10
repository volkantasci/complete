// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { patch } from "@web/core/utils/patch";
import { HrUserPreferencesController as CwmHrPrefsController } from "@hr/views/preferences_form_view";
import { cwmAfterPrefsSaved } from "@web_mobile/account/account_prefs_form";

// The account details go to the app first; the Community follow-up (the context reload after
// a language change) runs once that is done. The send never throws.
patch(CwmHrPrefsController.prototype, {
    async onRecordSaved(record) {
        await cwmAfterPrefsSaved(record);
        return super.onRecordSaved(...arguments);
    },
});
