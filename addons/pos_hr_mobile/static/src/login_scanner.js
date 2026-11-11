// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { scanBarcode } from "@web/core/barcode/barcode_dialog";
import { isBarcodeScannerSupported } from "@web/core/barcode/barcode_video_scanner";
import { LoginScreen } from "@point_of_sale/app/screens/login_screen/login_screen";

patch(LoginScreen.prototype, {
    /**
     * The badge scanner button: read a code with the rear camera and hand it to the point of
     * sale as if a hardware scanner had sent it.
     */
    async cwmScanBadge() {
        const barcodeReader = this.pos.barcodeReader;
        if (!isBarcodeScannerSupported() || !barcodeReader) {
            return;
        }
        // the promise never settles when the dialog is closed without a result
        const code = await scanBarcode(this.env, "environment");
        if (!code) {
            this.pos.notification.add(_t("No code was read. Please scan the badge again."), {
                type: "warning",
            });
            return;
        }
        await barcodeReader.scan(code);
        navigator.vibrate?.(100);
    },
});
