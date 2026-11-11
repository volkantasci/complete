// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { cwmCallables, cwmDetectedHost } from "@web_mobile/bridge/bridge_service";

/**
 * Original capability object: one function per capability the app lists, each taking the
 * arguments and returning a promise. The very same functions the `mobile` service offers;
 * empty without an app.
 */
const host = cwmDetectedHost();
export const methods = cwmCallables(host);

/** The helper object of the app (`{}` when there is none). */
export const polyfills = host.polyfills;

export default { methods, polyfills };
