// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";

const CONTACTS = "cws_tour.menu_contacts";
const NOTES = "cws_tour.menu_notes";
const EXTRAS = "cws_tour.menu_extras";
const tile = (xmlid) => `a.o_app[data-menu-xmlid="${xmlid}"]`;
const GRID_BUTTON = ".o_navbar .o_menu_toggle:not(.o_menu_toggle_back):not(.o_hidden)";
const BACK_CHEVRON = ".o_navbar .o_menu_toggle.o_menu_toggle_back";

/**
 * The partner name input: a textarea in the base form, a text input once the
 * autocomplete widget replaces it (installed together with Discuss).
 */
const nameField = (value) => {
    const suffix = value ? `:value(${value})` : "";
    const base = ".o_form_view .o_field_widget[name=name]";
    return `${base} textarea${suffix}, ${base} input${suffix}`;
};

/** Fixture tiles in display order, as xmlids. */
const fixtureOrder = () =>
    [...document.querySelectorAll("a.o_app[data-menu-xmlid^='cws_tour.']")].map(
        (el) => el.dataset.menuXmlid
    );

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}


const tours = registry.category("web_tour.tours");

tours.add("web_shell_landing_page", {
    steps: () => [
        { trigger: ".o_home_menu" },
        {
            trigger: `.o_home_menu ${tile(CONTACTS)}`,
            run() {
                assert(document.title === "Home", `title is "${document.title}"`);
                assert(location.pathname === "/odoo", `path is ${location.pathname}`);
                assert(!location.search, `search is ${location.search}`);
            },
        },
    ],
});

tours.add("web_shell_action_address", {
    steps: () => [
        { trigger: ".o_list_view" },
        { trigger: "body:not(:has(.o_home_menu))" },
    ],
});

tours.add("web_shell_tiles_user", {
    steps: () => [
        { trigger: tile(CONTACTS) },
        { trigger: tile(EXTRAS) },
        {
            trigger: "body:not(:has(" + tile(NOTES) + "))",
            run() {
                assert(
                    fixtureOrder().join() === [CONTACTS, EXTRAS].join(),
                    `tiles: ${fixtureOrder()}`
                );
                const label = document.querySelector(`${tile(CONTACTS)} .o_caption`);
                assert(label.textContent.trim() === "Shell Contacts", "tile label");
            },
        },
    ],
});

tours.add("web_shell_tiles_admin", {
    steps: () => [
        { trigger: tile(CONTACTS) },
        { trigger: tile(NOTES) },
        {
            trigger: tile(EXTRAS),
            run() {
                assert(
                    fixtureOrder().join() === [CONTACTS, NOTES, EXTRAS].join(),
                    `tiles: ${fixtureOrder()}`
                );
            },
        },
    ],
});

let historyLength;
tours.add("web_shell_open_tile_then_back", {
    steps: () => [
        {
            trigger: tile(CONTACTS),
            run() {
                historyLength = history.length;
            },
        },
        { trigger: tile(CONTACTS), run: "click" },
        {
            trigger: ".o_list_view",
            run() {
                assert(
                    history.length === historyLength + 1,
                    `history grew from ${historyLength} to ${history.length}`
                );
            },
        },
        { trigger: "body:not(:has(.o_home_menu))" },
        {
            trigger: ".o_navbar",
            run() {
                history.back();
            },
        },
        { trigger: ".o_home_menu" },
        { trigger: ".o_navbar .o_menu_toggle.o_hidden:hidden" },
    ],
});

tours.add("web_shell_toggle_restore_and_new_stack", {
    steps: () => [
        { trigger: ".o_list_view .o_data_row" },
        { trigger: ".o_searchview_input", run: "edit Shell" },
        { trigger: ".o_searchview_autocomplete .o-dropdown-item.focus", run: "click" },
        { trigger: ".o_searchview_facet" },
        { trigger: ".o_data_row .o_data_cell:contains(Shell Alpha)", run: "click" },
        { trigger: nameField("Shell Alpha") },
        { trigger: `${GRID_BUTTON}`, run: "click" },
        { trigger: ".o_home_menu" },
        { trigger: "body:not(:has(.o_form_view))" },
        { trigger: BACK_CHEVRON, run: "click" },
        { trigger: nameField("Shell Alpha") },
        { trigger: ".o_breadcrumb .o_back_button", run: "click" },
        // A9: same list, same filter
        { trigger: ".o_list_view .o_data_row" },
        { trigger: ".o_searchview_facet:contains(Shell)" },
        // A11: new stack from a tile opened over a record
        { trigger: ".o_data_row .o_data_cell:contains(Shell Alpha)", run: "click" },
        { trigger: ".o_form_view .o_breadcrumb .o_back_button" },
        { trigger: GRID_BUTTON, run: "click" },
        { trigger: `.o_home_menu ${tile(NOTES)}`, run: "click" },
        { trigger: ".o_last_breadcrumb_item:contains(Shell Notes)" },
        { trigger: "body:not(:has(.o_breadcrumb .o_back_button)):not(:has(.o_home_menu))" },
        { trigger: GRID_BUTTON, run: "click" },
        { trigger: BACK_CHEVRON, run: "click" },
        { trigger: ".o_last_breadcrumb_item:contains(Shell Notes)" },
        { trigger: "body:not(:has(.o_breadcrumb .o_back_button)):not(:has(.o_home_menu))" },
    ],
});

tours.add("web_shell_name_toggles_home_menu", {
    steps: () => [
        { trigger: ".o_list_view .o_data_row" },
        { trigger: ".o_searchview_input", run: "edit Alpha" },
        { trigger: ".o_searchview_autocomplete .o-dropdown-item.focus", run: "click" },
        { trigger: ".o_searchview_facet:contains(Alpha)" },
        { trigger: ".o_data_row:contains(Shell Alpha)" },
        // D7: the name is part of the one button, a click on its text toggles
        { trigger: ".o_navbar .o_menu_toggle .o_menu_brand:contains(Shell Contacts)", run: "click" },
        { trigger: ".o_home_menu" },
        { trigger: BACK_CHEVRON },
        { trigger: "body:not(:has(.o_list_view))" },
        { trigger: BACK_CHEVRON, run: "click" },
        { trigger: ".o_list_view .o_data_row" },
        { trigger: ".o_searchview_facet:contains(Alpha)" },
        { trigger: "body:not(:has(.o_home_menu))" },
        // from a record form the name still toggles instead of opening the start screen
        { trigger: ".o_data_row .o_data_cell:contains(Shell Alpha)", run: "click" },
        { trigger: nameField("Shell Alpha") },
        { trigger: ".o_navbar .o_menu_brand:contains(Shell Contacts)", run: "click" },
        { trigger: ".o_home_menu" },
        { trigger: "body:not(:has(.o_form_view))" },
        { trigger: BACK_CHEVRON, run: "click" },
        { trigger: nameField("Shell Alpha") },
    ],
});

tours.add("web_shell_unsaved_changes_saved_on_toggle", {
    steps: () => [
        { trigger: nameField(), run: "edit Shell Renamed" },
        { trigger: GRID_BUTTON, run: "click" },
        { trigger: ".o_home_menu" },
        { trigger: "body:not(:has(.o_dialog)):not(:has(.o_form_view))" },
        { trigger: BACK_CHEVRON, run: "click" },
        { trigger: nameField("Shell Renamed") },
        { trigger: ".o_form_view:not(.o_form_dirty)" },
    ],
});

tours.add("web_shell_order_survives_reload", {
    steps: () => [
        {
            trigger: tile(CONTACTS),
            run() {
                const order = fixtureOrder();
                assert(
                    order.indexOf(CONTACTS) < order.indexOf(NOTES),
                    `default order is ${order}`
                );
            },
        },
        {
            trigger: tile(NOTES),
            async run() {
                await user.setUserSettings("homemenu_config", JSON.stringify([NOTES, CONTACTS]));
                location.reload();
            },
            expectUnloadPage: true,
        },
        {
            trigger: tile(NOTES),
            run() {
                const order = fixtureOrder();
                assert(
                    order.indexOf(NOTES) < order.indexOf(CONTACTS),
                    `reloaded order is ${order}`
                );
            },
        },
    ],
});

tours.add("web_shell_default_order_for_user", {
    steps: () => [
        { trigger: tile(EXTRAS) },
        {
            trigger: tile(CONTACTS),
            run() {
                assert(
                    fixtureOrder().join() === [CONTACTS, EXTRAS].join(),
                    `order is ${fixtureOrder()}`
                );
            },
        },
    ],
});

tours.add("web_shell_admin_message_shown", {
    steps: () => [
        { trigger: tile(CONTACTS) },
        { trigger: ".o_home_menu .o_cws_admin_message:contains(Tour notice)" },
    ],
});

tours.add("web_shell_admin_message_hidden", {
    steps: () => [
        { trigger: tile(CONTACTS) },
        { trigger: ".o_home_menu:not(:has(.o_cws_admin_message))" },
    ],
});

function openPreferences() {
    return [
        { trigger: ".o_home_menu" },
        { trigger: ".o_user_menu", run: "click" },
        { trigger: ".dropdown-item[data-menu=preferences]", run: "click" },
        { trigger: ".modal .o_form_view .o_field_widget[name=color_scheme]" },
    ];
}

tours.add("web_shell_theme_field", {
    steps: () => [
        ...openPreferences(),
        { trigger: ".modal .o_field_widget[name=color_scheme] .o_radio_item:contains(System)" },
        { trigger: ".modal .o_field_widget[name=color_scheme] .o_radio_item:contains(Light)" },
        { trigger: ".modal .o_field_widget[name=color_scheme] .o_radio_item:contains(Dark)" },
        {
            trigger: ".modal .o_field_widget[name=color_scheme]",
            run() {
                const count = this.anchor.querySelectorAll("input[type=radio]").length;
                assert(count === 3, `${count} radios`);
            },
        },
    ],
});

tours.add("web_shell_dark_save", {
    steps: () => [
        ...openPreferences(),
        {
            trigger: ".modal .o_field_widget[name=color_scheme] input[data-value=dark]",
            run: "click",
        },
        {
            trigger: ".modal footer button[name=preference_save]",
            run: "click",
            expectUnloadPage: true,
        },
    ],
});

tours.add("web_shell_dark_loaded", {
    steps: () => [
        { trigger: ".o_home_menu" },
        {
            trigger: tile(CONTACTS),
            run() {
                const link = document.querySelector('link[href*="web.assets_web_dark"]');
                assert(link, "the dark bundle is not loaded");
            },
        },
    ],
});

tours.add("web_shell_missing_action", {
    steps: () => [{ trigger: ".o_home_menu" }, { trigger: tile(CONTACTS) }],
});

tours.add("web_shell_back_from_first_screen", {
    steps: () => [
        { trigger: nameField("Shell Alpha") },
        { trigger: "body:not(:has(.o_breadcrumb .o_back_button))" },
        {
            trigger: ".o_navbar",
            run() {
                // CE shows no in-app back button when nothing is behind the form
                const env = odoo.__WOWL_DEBUG__.root.env;
                env.services.action.currentController.config.historyBack();
            },
        },
        { trigger: ".o_home_menu" },
    ],
});
