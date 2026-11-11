// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";
import {
    download as cwmDownloadHelper,
    downloadFile as cwmFileHelper,
} from "@web/core/network/download";
import { registry } from "@web/core/registry";

/** Path and query of an address: scheme, host, port and fragment are dropped. */
export function cwmReducedAddress(url) {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname + parsed.search;
}

/**
 * Route the two Community download helpers to the app. Returns a function that puts the
 * Community behaviour back.
 *
 * @param {object} mobile the bridge service value
 * @param {{add: Function}} notification
 */
export function cwmInstallDownloadHandoff(mobile, notification) {
    if (!mobile.has("downloadFile")) {
        return () => {};
    }
    const originalRequest = cwmDownloadHelper._download;
    const originalFile = cwmFileHelper._download;
    const send = (description) => {
        mobile
            .downloadFile(description)
            .catch((error) => console.warn("[cwm] the app refused the download", error));
    };
    cwmDownloadHelper._download = (options) => {
        const description = { ...options, url: cwmReducedAddress(options.url) };
        if (odoo.csrf_token) {
            description.csrf_token = odoo.csrf_token;
        }
        send(description);
        return Promise.resolve();
    };
    cwmFileHelper._download = (data, filename, mimetype) => {
        const builtInPage = typeof data === "string" && /^(data|blob):/i.test(data);
        if (typeof data === "string" && !filename && !mimetype && !builtInPage) {
            send({ form: { method: "GET" }, url: cwmReducedAddress(data) });
            return true;
        }
        notification.add(
            _t("This file is generated in the page and can't be saved from inside the mobile app."),
            { type: "warning" }
        );
        return false;
    };
    return () => {
        cwmDownloadHelper._download = originalRequest;
        cwmFileHelper._download = originalFile;
    };
}

export const cwmDownloadHandoffService = {
    dependencies: ["mobile", "notification"],
    start(env, { mobile, notification }) {
        cwmInstallDownloadHandoff(mobile, notification);
    },
};

registry.category("services").add("cwm_download_handoff", cwmDownloadHandoffService);
