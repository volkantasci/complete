// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { registry } from "@web/core/registry";

// Tours that reach the states of the point of sale screens and ask the Python side (through a
// console line) to capture the viewport. Run only by the on-demand screenshot test.

const SCANNER = ".login-overlay .mobile-scanner";
const PIN_INPUT = ".login-overlay input[placeholder='Enter your PIN']";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shoot(name) {
    return {
        content: `capture ${name}`,
        trigger: "body",
        run: async () => {
            // let the animations end
            await sleep(1500);
            const phone = window.innerWidth < 768;
            console.log(`cwm-shot ${name}${phone ? ".mobile" : ""}`);
            await sleep(1500);
        },
    };
}

function arm(settings) {
    return {
        content: "arm the camera stand-in",
        trigger: "body",
        run: () => Object.assign(window.cwmCamera, { feed: null, ...settings }),
    };
}

const toPinStep = [
    { content: "open the register", trigger: ".login-overlay .open-register-btn", run: "click" },
    { content: "the PIN step is shown", trigger: PIN_INPUT },
];

const openScanner = [
    { content: "press the scanner button", trigger: SCANNER, run: "click" },
];

function add(name, steps) {
    registry.category("web_tour.tours").add(name, { steps: () => steps });
}

add("cwm_shot_login", [arm({ mode: "ok" }), ...toPinStep, shoot("09-pos-badge-login")]);

add("cwm_shot_scanner", [
    arm({ mode: "ok" }),
    ...toPinStep,
    ...openScanner,
    { content: "the scanner dialog is open", trigger: ".modal video" },
    shoot("10-pos-scanner-open"),
]);

add("cwm_shot_refused", [
    arm({ mode: "refused" }),
    ...toPinStep,
    ...openScanner,
    { content: "the camera error is shown", trigger: ".modal:has(strong)" },
    shoot("11-pos-camera-refused"),
]);

add("cwm_shot_missing", [
    arm({ mode: "missing" }),
    ...toPinStep,
    ...openScanner,
    { content: "the camera error is shown", trigger: ".modal:has(strong)" },
    shoot("12-pos-no-camera"),
]);

add("cwm_shot_empty", [
    arm({ mode: "ok" }),
    ...toPinStep,
    ...openScanner,
    { content: "the scanner dialog is open", trigger: ".modal video" },
    { content: "the scanner reads an empty code", trigger: "body", run: () => (window.cwmCamera.feed = "") },
    { content: "the notice is shown", trigger: ".o_notification" },
    shoot("13-pos-empty-scan-notice"),
]);

add("cwm_shot_scanned", [
    arm({ mode: "ok" }),
    ...toPinStep,
    ...openScanner,
    { content: "the scanner dialog is open", trigger: ".modal video" },
    {
        content: "the camera shows Ernest Reed's badge",
        trigger: "body",
        run: () => (window.cwmCamera.feed = "041517863199"),
    },
    { content: "the product screen is shown", trigger: ".product-screen" },
    shoot("14-pos-badge-scanned"),
]);
