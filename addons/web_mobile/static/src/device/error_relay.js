// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";

/**
 * Error handler: hand an uncaught page error to the app. It never stops the chain, so the
 * Community display always follows.
 *
 * @param {object} env
 * @param {Error} error the Community error object
 * @param {*} originalError the error that was actually caught
 */
export function cwmRelayError(env, error, originalError) {
    const mobile = env.services.mobile;
    if (!mobile?.has("crashManager")) {
        return false;
    }
    let payload;
    try {
        payload = JSON.parse(JSON.stringify(Object.assign({}, error, { originalError })));
    } catch (failure) {
        console.warn("[cwm] the error could not be serialised for the app", failure);
        return false;
    }
    mobile
        .crashManager(payload)
        .catch((failure) => console.warn("[cwm] the app refused the error report", failure));
    return false;
}

// Just before the first Community handler that shows an error (rpcErrorHandler, 97).
registry.category("error_handlers").add("cwm_relay_error", cwmRelayError, { sequence: 96 });
