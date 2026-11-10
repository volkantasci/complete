// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Test-only stand-in for the camera and the code detection. Inert until a tour sets
// window.cwmCamera.mode ("ok", "refused", "missing") and, for "ok", window.cwmCamera.feed
// (the code the next detection reads; "" is an empty code).

import { patch } from "@web/core/utils/patch";
import { BarcodeVideoScanner } from "@web/core/barcode/barcode_video_scanner";

const camera = (window.cwmCamera = { mode: "ok", feed: null, requests: [], vibrations: [] });

window.BarcodeDetector = class {
    static async getSupportedFormats() {
        return ["qr_code"];
    }
    async detect() {
        return [];
    }
};

navigator.vibrate = (pattern) => {
    camera.vibrations.push(pattern);
    return true;
};

function pictureStream() {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    const draw = () => {
        context.fillStyle = "#223";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#fff";
        context.fillRect(Math.random() * 600, Math.random() * 440, 40, 40);
    };
    draw();
    setInterval(draw, 50);
    return canvas.captureStream(20);
}

if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
        camera.requests.push(constraints);
        if (camera.mode === "refused") {
            throw new DOMException("Permission denied", "NotAllowedError");
        }
        if (camera.mode === "missing") {
            throw new DOMException("Requested device not found", "NotFoundError");
        }
        return pictureStream();
    };
}

patch(BarcodeVideoScanner.prototype, {
    async detectCode() {
        if (camera.feed !== null) {
            const code = camera.feed;
            camera.feed = null;
            this.barcodeDetected(code);
            return;
        }
        return super.detectCode(...arguments);
    },
});
