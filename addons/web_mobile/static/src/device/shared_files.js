// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { shareTargetService } from "@web/webclient/share_target/share_target_service";

/**
 * Make the Community share step ask the app for the shared files instead of the service
 * worker. Returns a function that puts the Community behaviour back.
 *
 * @param {object} mobile the bridge service value
 * @param {{add: Function}} notification
 */
export function cwmInstallSharedFiles(mobile, notification) {
    if (!mobile.has("getShareTargetFiles")) {
        return () => {};
    }
    const original = shareTargetService._getShareTargetFiles;
    const warn = (message) => notification.add(message, { type: "warning" });
    shareTargetService._getShareTargetFiles = async () => {
        if (!registry.category("share_target_items").getAll().length) {
            return [];
        }
        let answer;
        try {
            answer = await mobile.getShareTargetFiles({});
        } catch (failure) {
            console.warn("[cwm] the app could not hand over the shared files", failure);
            warn(_t("The files shared with the app could not be loaded."));
            return [];
        }
        const described = Array.isArray(answer?.data) ? answer.data : [];
        const files = [];
        for (const { uri, name, type } of described) {
            let blob = null;
            try {
                const response = await fetch(
                    `/share_target.localhost/?uri=${encodeURIComponent(uri)}`
                );
                blob = response.ok ? await response.blob() : null;
            } catch (failure) {
                console.warn("[cwm] a shared file could not be read", failure);
            }
            if (!blob) {
                warn(_t('The shared file "%s" could not be loaded from the app.', name));
                return [];
            }
            files.push(new File([blob], name, { type }));
        }
        return files;
    };
    return () => {
        shareTargetService._getShareTargetFiles = original;
    };
}

export const cwmSharedFilesService = {
    dependencies: ["mobile", "notification", "share_target"],
    start(env, { mobile, notification }) {
        cwmInstallSharedFiles(mobile, notification);
    },
};

registry.category("services").add("cwm_shared_files", cwmSharedFilesService);
