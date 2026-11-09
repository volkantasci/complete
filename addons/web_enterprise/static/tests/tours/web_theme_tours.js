// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_utils";

const TILE = 'a.o_app[data-menu-xmlid="cws_theme.menu_decisions"]';
const NAME = ".o_navbar .o_menu_toggle .o_menu_brand";
const tours = registry.category("web_tour.tours");

/** The home menu is still there after a pause long enough for a restored application to show. */
const homeMenuStays = () => ({
    trigger: ".o_home_menu",
    async run() {
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (!document.querySelector(".o_home_menu")) {
            throw new Error("the home menu left");
        }
    },
});

/** The steps that open the application from its tile and see its list. */
const openFromTile = () => [
    { trigger: `.o_home_menu ${TILE}`, run: "click" },
    { trigger: ".o_list_view .o_data_row" },
    { trigger: "body:not(:has(.o_home_menu))" },
];

// A103: the application name shows the home menu, then the Community step must keep it
tours.add("web_theme_A103_step_after_app_name_click", {
    steps: () => [
        { trigger: ".o_list_view .o_data_row" },
        { trigger: NAME, run: "click" },
        // the home menu is up over the application before the step runs
        { trigger: "body.o_home_menu_background .o_home_menu" },
        stepUtils.showAppsMenuItem(),
        homeMenuStays(),
        // still the home menu over the application, with the tile to find
        { trigger: "body.o_home_menu_background .o_home_menu" },
        ...openFromTile(),
    ],
});

// A103, without waiting: the step comes straight after the click, whatever the timing
tours.add("web_theme_A103_step_right_after_click", {
    steps: () => [
        { trigger: ".o_list_view .o_data_row" },
        { trigger: NAME, run: "click" },
        stepUtils.showAppsMenuItem(),
        homeMenuStays(),
        { trigger: "body.o_home_menu_background .o_home_menu" },
        ...openFromTile(),
    ],
});

// A105: from inside an application the step shows the home menu
tours.add("web_theme_A105_step_from_inside_app", {
    steps: () => [
        { trigger: ".o_list_view .o_data_row" },
        { trigger: "body:not(:has(.o_home_menu))" },
        stepUtils.showAppsMenuItem(),
        { trigger: ".o_home_menu" },
        ...openFromTile(),
    ],
});

// A106: nothing behind the home menu: the step completes and the menu stays until the tile click
tours.add("web_theme_A106_step_on_empty_home_menu", {
    steps: () => [
        { trigger: ".o_home_menu" },
        stepUtils.showAppsMenuItem(),
        homeMenuStays(),
        ...openFromTile(),
    ],
});
