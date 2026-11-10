// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { BackButtonManager as CwmBackManager } from "@web/core/utils/hooks";

/**
 * Make the Community back-aware layers use the app's back button instead of browser history.
 * Returns a function that undoes it.
 *
 * @param {object} mobile the bridge service value
 */
export function cwmInstallBackOverride(mobile) {
    if (!mobile.has("overrideBackButton")) {
        return () => {};
    }
    const tell = (enabled) =>
        mobile
            .overrideBackButton({ enabled })
            .catch((error) => console.warn("[cwm] the app refused the back button request", error));
    return patch(CwmBackManager.prototype, {
        _activate() {
            this._cwmOffPending = false;
            if (this._cwmOn) {
                return;
            }
            this._cwmOn = true;
            this._cwmListener ||= () => this._performLatestBackAction();
            document.addEventListener("backbutton", this._cwmListener);
            tell(true);
        },
        _deactivate() {
            this._cwmOffPending = true;
            // same deferral as the Community: a layer swapped in the same tick keeps it on
            Promise.resolve().then(() => {
                if (!this._cwmOffPending) {
                    return;
                }
                this._cwmOffPending = false;
                if (this._cwmOn) {
                    this._cwmOn = false;
                    document.removeEventListener("backbutton", this._cwmListener);
                    tell(false);
                }
            });
        },
    });
}

export const cwmBackOverrideService = {
    dependencies: ["mobile"],
    start(env, { mobile }) {
        cwmInstallBackOverride(mobile);
    },
};

registry.category("services").add("cwm_back_override", cwmBackOverrideService);
