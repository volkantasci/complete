// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { session } from "@web/session";

const CWM_SIDE = 128;

/**
 * Read the user's medium-sized picture from the server and return it as the base64 text
 * (no prefix) of a 128 x 128 PNG, stretched to fill the square. Null when the picture cannot
 * be loaded or decoded; one console entry is written then.
 *
 * @param {number} uid
 * @returns {Promise<string|null>}
 */
export async function cwmReadAccountPicture(uid) {
    try {
        const response = await fetch(`/web/image/res.users/${uid}/image_medium?unique=${Date.now()}`);
        if (!response.ok) {
            throw new Error(`answer ${response.status}`);
        }
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = document.createElement("canvas");
        canvas.width = CWM_SIDE;
        canvas.height = CWM_SIDE;
        canvas.getContext("2d").drawImage(bitmap, 0, 0, CWM_SIDE, CWM_SIDE);
        bitmap.close?.();
        const url = canvas.toDataURL("image/png");
        const base64 = url.slice(url.indexOf(",") + 1);
        if (!base64 || !url.startsWith("data:image/png")) {
            throw new Error("the picture cannot be encoded");
        }
        return base64;
    } catch (error) {
        console.warn("[cwm] the account picture cannot be read, details not sent", error);
        return null;
    }
}

/**
 * Send the account details to the app. Never throws: a failure of any kind writes one
 * console entry. With `wait` false the answer is not awaited.
 *
 * @param {object} mobile the `mobile` service
 * @param {{name: string, login: string}} values
 * @param {{wait?: boolean}} [options]
 */
export async function cwmSendAccount(mobile, { name, login }, { wait = true } = {}) {
    try {
        if (!mobile.has("updateAccount")) {
            return;
        }
        const avatar = await cwmReadAccountPicture(user.userId);
        if (avatar === null) {
            return;
        }
        const answer = mobile
            .updateAccount({ avatar, name, username: login, uid: user.userId, db: session.db })
            .catch((error) => console.warn("[cwm] the app refused the account details", error));
        if (wait) {
            await answer;
        }
    } catch (error) {
        console.warn("[cwm] sending the account details failed", error);
    }
}

/**
 * Send the details once at start with the logged-in user's current values; not awaited.
 * After a preferences save the saved values are sent instead.
 */
export const cwmAccountSyncService = {
    dependencies: ["mobile"],
    start(env, { mobile }) {
        if (mobile.has("updateAccount")) {
            cwmSendAccount(mobile, { name: user.name, login: user.login }, { wait: false });
        }
    },
};

registry.category("services").add("cwm_account_sync", cwmAccountSyncService);

