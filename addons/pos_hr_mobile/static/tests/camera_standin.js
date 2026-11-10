// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Test-only stand-in for the camera and the code detection. Every override is inert while
// window.cwmCamera.mode is null (the default), so tours of other modules sharing the test
// bundle are unaffected. A tour sets the mode ("ok", "refused", "missing") first and, for
// "ok", window.cwmCamera.feed (the code the next detection reads; "" is an empty code).

import { patch } from "@web/core/utils/patch";
import * as cwmVideoModule from "@web/core/barcode/barcode_video_scanner";

const camera = (window.cwmCamera = { mode: null, feed: null, requests: [], vibrations: [] });

const originalDetector = window.BarcodeDetector;
const originalVibrate = navigator.vibrate?.bind(navigator);

window.BarcodeDetector = class {
    static async getSupportedFormats() {
        if (camera.mode === null) {
            return originalDetector ? originalDetector.getSupportedFormats() : [];
        }
        return ["qr_code"];
    }
    constructor(...args) {
        this.original = camera.mode === null && originalDetector ? new originalDetector(...args) : null;
    }
    async detect(...args) {
        return this.original ? this.original.detect(...args) : [];
    }
};

navigator.vibrate = (pattern) => {
    if (camera.mode === null) {
        return originalVibrate ? originalVibrate(pattern) : false;
    }
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
    const originalUserMedia = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (camera.mode === null) {
            return originalUserMedia(constraints);
        }
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

const cwmScannerProto = cwmVideoModule.BarcodeVideoScanner.prototype;
patch(cwmScannerProto, {
    async detectCode() {
        if (camera.mode !== null && camera.feed !== null) {
            const code = camera.feed;
            camera.feed = null;
            this.barcodeDetected(code);
            return;
        }
        return super.detectCode(...arguments);
    },
});
