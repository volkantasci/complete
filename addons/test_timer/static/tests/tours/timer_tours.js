// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";

const timerText = () => document.querySelector(".o_form_view .o_timer_start_field")?.textContent;
let frozen;

registry.category("web_tour.tours").add("timer_form_start_pause_resume_stop", {
    steps: () => [
        { trigger: ".o_form_view .o_field_widget[name=timer_start]:not(:has(.o_timer_start_field))" },
        { trigger: ".o_statusbar_buttons button[name=action_timer_start]", run: "click" },
        { trigger: ".o_timer_start_field:contains(01:30:0)" },
        { trigger: ".o_timer_start_field:contains(01:30:0):not(:contains(01:30:00))" },
        { trigger: ".o_statusbar_buttons button[name=action_timer_pause]", run: "click" },
        {
            trigger: ".o_statusbar_buttons button[name=action_timer_resume]",
            run() {
                frozen = timerText();
            },
        },
        {
            // value stays frozen while paused
            trigger: ".o_form_view",
            async run() {
                await new Promise((resolve) => setTimeout(resolve, 2100));
                if (timerText() !== frozen) {
                    throw new Error(`Paused display moved: ${frozen} -> ${timerText()}`);
                }
            },
        },
        { trigger: ".o_statusbar_buttons button[name=action_timer_resume]", run: "click" },
        {
            trigger: ".o_statusbar_buttons button[name=action_timer_pause]",
            run() {
                if (timerText() < frozen) {
                    throw new Error(`Resumed display went back: ${timerText()} < ${frozen}`);
                }
            },
        },
        { trigger: ".o_statusbar_buttons button[name=action_timer_stop]", run: "click" },
        { trigger: ".o_form_view .o_field_widget[name=timer_start]:not(:has(.o_timer_start_field))" },
        { trigger: ".o_statusbar_buttons button[name=action_timer_start]" },
    ],
});

registry.category("web_tour.tours").add("timer_list_and_form_responsive", {
    steps: () => [
        { trigger: ".o_list_renderer .o_data_row:contains(Tour paused A) .o_timer_start_field:contains(01:00:00)" },
        { trigger: ".o_data_row:contains(Tour running B) .o_timer_start_field:contains(01:55:)" },
        {
            trigger: ".o_data_row:contains(Tour running B)",
            async run() {
                const read = () =>
                    [...document.querySelectorAll(".o_data_row")]
                        .find((row) => row.textContent.includes("Tour running B"))
                        ?.querySelector(".o_timer_start_field")?.textContent;
                const before = read();
                await new Promise((resolve) => setTimeout(resolve, 2100));
                if (read() === before) {
                    throw new Error(`Running row did not tick: ${before}`);
                }
            },
        },
        { trigger: ".o_data_row:contains(Tour running B) td[name=name]", run: "click" },
        { trigger: ".o_form_view .o_timer_start_field:contains(01:55:)" },
        {
            trigger: ".o_form_view",
            async run() {
                const before = timerText();
                await new Promise((resolve) => setTimeout(resolve, 2100));
                if (timerText() === before) {
                    throw new Error(`Form display did not tick: ${before}`);
                }
            },
        },
    ],
});

registry.category("web_tour.tours").add("timer_toggle_starts_and_stops", {
    steps: () => [
        { trigger: ".o_data_row:contains(Tour toggle) .o_timer_toggle_button[title=Start]", run: "click" },
        { trigger: ".o_data_row:contains(Tour toggle) .o_timer_toggle_button[title=Stop]" },
        { trigger: ".o_data_row:contains(Tour toggle) .o_timer_start_field:contains(00:00:)" },
        { trigger: ".o_list_view" },
        { trigger: ".o_data_row:contains(Tour toggle) .o_timer_toggle_button[title=Stop]", run: "click" },
        { trigger: ".o_data_row:contains(Tour toggle) .o_timer_toggle_button[title=Start]" },
        { trigger: ".o_list_view:not(:has(.o_data_row:contains(Tour toggle) .o_timer_start_field))" },
    ],
});
