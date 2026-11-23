// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    $$,
    assert,
    assertEqual,
    cellOfDate,
    clean,
    closeDialog,
    dataSettled,
    facets,
    isGrey,
    labelOf,
    noteMark,
    pickRange,
    pillsOf,
    realClick,
    rectOf,
    removeFacet,
    rowNames,
    scenario,
    searchFor,
    send,
    settle,
    step,
    until,
    writesSince,
} from "@hr_holidays_gantt/../tests/tours/time_off_tours";
import {
    closeWithEscape,
    firstDayOf,
    loaded,
    openPopoverOf,
    openToffAct,
    pillOn,
    popover,
    titleOf,
} from "@hr_holidays_gantt/../tests/tours/time_off_popover_tours";

/**
 * Tours of the footer's buttons of the leave popover of slice 002e2 (Task 6): Edit, Save, Approve,
 * Refuse, Discard and Delete, what the user sees (the buttons by their boxes) and what each leaves
 * on the server (`tests/test_button_tours.py` reads it after the tour). The records come from
 * `tests/time_off_fixtures.py`; the clock is Wednesday 11 November 2026 (except where a tour
 * says it starts on the server's day), so the Week range after one step reads Sunday 15 to
 * Saturday 21 November.
 */

const tours = registry.category("web_tour.tours");

const TOFF_ACT = "Toff Act";
const ROLE_EMP = "Toff Role Emp";
const PEER = "Toff Peer";

// what the user sees ---------------------------------------------------------------------------------

/**
 * The buttons of the footer that the user sees, left to right: a box with a size, whose middle
 * lies on the button itself (no layer covers it).
 */
function visibleButtons() {
    return $$(".o_hhg_pop_footer button")
        .filter((button) => {
            const box = rectOf(button);
            if (box.width < 1 || box.height < 1) {
                return false;
            }
            const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return Boolean(top) && button.contains(top);
        })
        .sort((a, b) => rectOf(a).left - rectOf(b).left)
        .map((button) => clean(button.textContent));
}

/** Waits for the footer to show exactly these buttons, left to right. */
async function expectButtons(expected, what) {
    try {
        await until(
            () => JSON.stringify(visibleButtons()) === JSON.stringify(expected),
            `${what}: the buttons read ${JSON.stringify(expected)}`,
            8000
        );
    } catch (error) {
        throw new Error(`${error.message}; the footer shows ${JSON.stringify(visibleButtons())}`);
    }
}

const buttonOf = (label) =>
    $$(".o_hhg_pop_footer button").find((button) => clean(button.textContent) === label);

/** A real click on a button of the footer. */
async function pressButton(label) {
    const button = buttonOf(label);
    assert(button, `the ${label} button: ${JSON.stringify(visibleButtons())}`);
    await realClick(button);
}

/** Types a note into the description with the real keyboard: the cursor stays in the field. */
async function typeDescription(text) {
    const area = await until(() => $(".o_hhg_pop textarea"), "the description area");
    await realClick(area);
    await until(() => document.activeElement === area, "the cursor is in the description");
    await send({ method: "Input.insertText", events: [{ text }] });
    await settle(300);
}

/** After a write: the view's data have come back and are drawn. */
async function written() {
    await dataSettled();
    await settle(600);
}

const isEditable = () => Boolean($(".o_hhg_pop .o_form_editable"));
const isReadonly = () => Boolean($(".o_hhg_pop .o_form_readonly"));

/** The hours of a row's label ("24h" is 24). */
const hoursOf = (name) => Number(/(\d+(?:\.\d+)?)h/.exec(labelOf(name))?.[1]);

/** The popover's frame, as the user sees it placed. */
const frameOf = () => rectOf($(".o_popover:has(.o_hhg_pop)"));

/** The text of the dialog over the page (the Community's error). */
async function errorText() {
    await until(() => $(".modal"), "the Community's error dialog", 10000);
    await settle(400);
    return clean($(".modal").textContent);
}

/** A tour that starts on the list of Management > Time Off. */
const fromList = (name, body) =>
    tours.add(name, {
        steps: () => [{ trigger: ".o_list_view", timeout: 60000, run: body }],
    });

/**
 * The Gantt view of Management > Time Off, on the Week range of 15 to 21 November (`next`: the
 * range after the one around today; false stays on the week of today).
 */
async function openManagement(search = null, { next = true } = {}) {
    await until(() => $(".o_list_view"), "the list of Management > Time Off", 60000);
    await settle(500);
    await realClick($(".o_cp_switch_buttons .o_switch_view.o_gantt"));
    await until(() => $(".o_tl_renderer .o_tl_row_header"), "the leave view", 20000);
    await dataSettled();
    await settle(500);
    // the default search of the approvers shows requests waiting for them only
    while (facets().some((facet) => facet.includes("Waiting For Me"))) {
        await removeFacet("Waiting For Me");
    }
    await pickRange("week");
    if (next) {
        await step(1);
    }
    if (search) {
        await searchFor(search);
        await until(
            () => JSON.stringify(rowNames()) === JSON.stringify([search]),
            `one row, ${search}: ${rowNames()}`,
            8000
        );
    }
    await dataSettled();
    await settle(500);
}

// A13, A16: a pending change for an Admin ------------------------------------------------------------

scenario("hhg_a13_pending_change", async () => {
    await openToffAct();
    const mark = noteMark();
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-18"));
    await expectButtons(["Approve", "Refuse", "Delete"], "the request To Approve");
    assert(isEditable(), "the request To Approve is editable");
    await typeDescription("Dentist");
    // the field is left: the pending change shows
    await realClick($(".o_hhg_pop_title"));
    await expectButtons(["Approve", "Refuse", "Discard"], "a pending change");
    assert(!visibleButtons().includes("Delete"), "no Delete");
    assert(!visibleButtons().includes("Save"), "no Save for one who may approve");
    // Discard brings the empty description and Delete back
    await pressButton("Discard");
    await expectButtons(["Approve", "Refuse", "Delete"], "after Discard");
    assertEqual($(".o_hhg_pop textarea").value, "", "the description is empty again");
    assertEqual(writesSince(mark), [], "Discard writes nothing");
});

// A17: Second Approval and Approved -------------------------------------------------------------------

scenario("hhg_a17_second_approval_and_approved", async () => {
    await openToffAct();
    const mark = noteMark();
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-19"));
    assert(isReadonly(), "the request at Second Approval is read-only");
    await expectButtons(["Edit", "Delete"], "Second Approval");
    await closeWithEscape();
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-20"), { replace: true });
    assert(isReadonly(), "the Approved request is read-only");
    await expectButtons(["Edit", "Delete"], "Approved");
    assertEqual(writesSince(mark), [], "no write");
});

// A34: Edit -------------------------------------------------------------------------------------------

scenario("hhg_a34_edit", async () => {
    await openToffAct();
    const hours = hoursOf(TOFF_ACT);
    assert(isGrey(cellOfDate(TOFF_ACT, "2026-11-20")), "Friday 20 is greyed (the request is Approved)");
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-20"));
    await expectButtons(["Edit", "Delete"], "the Approved request");
    const open = popover();
    await pressButton("Edit");
    await expectButtons(["Approve", "Refuse", "Delete"], "after Edit");
    await written();
    assert(popover() === open, "the popover stays open as it is");
    assert(isEditable(), "the popover is editable");
    assert(
        !document.activeElement?.closest(".o_hhg_pop_content"),
        `the focus is not moved into the form: ${document.activeElement?.outerHTML.slice(0, 80)}`
    );
    const pill = pillOn(TOFF_ACT, "2026-11-20");
    assert(pill.classList.contains("o_tl_striped"), "the pill is striped");
    assert($(".o_tl_pill_mark.o_tl_mark_info", pill), "the pill carries the info mark");
    assert(!isGrey(cellOfDate(TOFF_ACT, "2026-11-20")), "Friday 20 is no longer greyed");
    await until(() => hoursOf(TOFF_ACT) === hours + 8, `the label grows by 8 h from ${hours}: ${labelOf(TOFF_ACT)}`);
});

// A35: Approve by an Admin of a type approved twice ----------------------------------------------------

scenario("hhg_a35_approve_twice_admin", async () => {
    await openToffAct();
    assert(!isGrey(cellOfDate(TOFF_ACT, "2026-11-19")), "Thursday 19 is not greyed at Second Approval");
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-19"));
    await expectButtons(["Edit", "Delete"], "Second Approval");
    await pressButton("Edit");
    await expectButtons(["Approve", "Refuse", "Delete"], "after Edit");
    const open = popover();
    await pressButton("Approve");
    await expectButtons(["Edit", "Delete"], "after Approve");
    await written();
    assert(popover() === open, "the popover stays open");
    assert(isReadonly(), "the popover is read-only");
    assert(isGrey(cellOfDate(TOFF_ACT, "2026-11-19")), "Thursday 19 is greyed (Approved at once)");
});

// A37: Refuse in the Overview -------------------------------------------------------------------------

scenario("hhg_a37_refuse_overview", async () => {
    await openToffAct();
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-18"));
    const open = popover();
    const before = frameOf();
    await pressButton("Refuse");
    await until(() => !pillOn(TOFF_ACT, "2026-11-18"), "the pill leaves the Overview", 10000);
    await written();
    assert(popover() === open && open.isConnected, "the popover stays open");
    assert(isReadonly(), "read-only");
    await expectButtons(["Edit", "Delete"], "Refused");
    const after = frameOf();
    // centred on the pill's place as before (the width follows the body, read-only now), and the
    // same distance below (or above) it
    const middle = (frame) => frame.left + frame.width / 2;
    assert(
        Math.abs(middle(after) - middle(before)) < 4 && Math.abs(after.top - before.top) < 6,
        `the popover stays on its place: ${JSON.stringify([middle(before), before.top])} then ${JSON.stringify([middle(after), after.top])}`
    );
    assert(titleOf().startsWith(TOFF_ACT), `it keeps its title: ${titleOf()}`);
    // it closes as any popover does, and the next click on another pill opens that one
    await closeWithEscape();
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-20"));
    await expectButtons(["Edit", "Delete"], "the Approved request opens afterwards");
});

// A38: Approve saves a pending change first ------------------------------------------------------------

scenario("hhg_a38_approve_saves_first", async () => {
    await openToffAct();
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-18"));
    await typeDescription("Dentist");
    await realClick($(".o_hhg_pop_title"));
    await expectButtons(["Approve", "Refuse", "Discard"], "a pending change");
    await pressButton("Approve");
    await expectButtons(["Edit", "Delete"], "after Approve");
    await written();
    assert(isReadonly(), "read-only");
    assertEqual($(".o_hhg_pop_note")?.textContent.includes("Dentist"), true, "the description reads Dentist");
});

// A52, A82: Delete by an Admin -------------------------------------------------------------------------

scenario("hhg_a52_delete_admin", async () => {
    await openToffAct();
    const hours = hoursOf(TOFF_ACT);
    assert(isGrey(cellOfDate(TOFF_ACT, "2026-11-20")), "Friday 20 is greyed");
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-20"));
    await pressButton("Delete");
    await until(() => !popover(), "the popover closes", 10000);
    await written();
    assert(!pillOn(TOFF_ACT, "2026-11-20"), "the pill is gone");
    assert(!isGrey(cellOfDate(TOFF_ACT, "2026-11-20")), "Friday 20 is no longer greyed");
    await until(() => hoursOf(TOFF_ACT) === hours + 8, `the label grows by 8 h from ${hours}: ${labelOf(TOFF_ACT)}`);
});

scenario("hhg_a82_delete_frees_days", async () => {
    await openToffAct();
    const days = ["2026-11-16", "2026-11-17", "2026-11-18"];
    for (const day of days) {
        assert(isGrey(cellOfDate(TOFF_ACT, day)), `${day} is greyed`);
    }
    const hours = hoursOf(TOFF_ACT);
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-16"));
    await pressButton("Delete");
    await until(() => !popover(), "the popover closes", 10000);
    await written();
    assertEqual(pillsOf(TOFF_ACT).length, 0, "the pill is gone");
    for (const day of days) {
        assert(!isGrey(cellOfDate(TOFF_ACT, day)), `${day} is no longer greyed`);
    }
    await until(() => hoursOf(TOFF_ACT) === hours + 24, `the label grows by 24 h from ${hours}: ${labelOf(TOFF_ACT)}`);
});

// A53: Delete of an Approved request by an Officer ------------------------------------------------------

scenario("hhg_a53_delete_approved_officer", async () => {
    await openToffAct();
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-20"));
    await expectButtons(["Edit", "Delete"], "the Approved request");
    const open = popover();
    await pressButton("Delete");
    const text = await errorText();
    assert(text.includes("can only be deleted by Administrators"), `the Community's error: "${text}"`);
    assert(popover() === open, "the popover stays open under the dialog");
    await closeDialog();
    assert(popover() === open && isReadonly(), "and after the dialog");
    await expectButtons(["Edit", "Delete"], "nothing changed");
    assert(pillOn(TOFF_ACT, "2026-11-20"), "the pill is still there");
});

// A84: the final approval of a request at Second Approval, by an Officer ---------------------------------

scenario("hhg_a84_final_approval_officer", async () => {
    await openToffAct();
    await openPopoverOf(pillOn(TOFF_ACT, "2026-11-19"));
    await expectButtons(["Edit", "Delete"], "Second Approval");
    await pressButton("Edit");
    await expectButtons(["Approve", "Refuse", "Delete"], "after Edit");
    await written();
    assert(isEditable(), "the popover is editable");
    await pressButton("Approve");
    await expectButtons(["Edit", "Delete"], "after Approve");
    await written();
    assert(isGrey(cellOfDate(TOFF_ACT, "2026-11-19")), "Thursday 19 is greyed (Approved by one press)");
});

// A14, A15: an Employee's own request To Approve ---------------------------------------------------------

fromList("hhg_a14_employee_own_request", async () => {
    await openManagement();
    const mark = noteMark();
    await openPopoverOf(pillOn(ROLE_EMP, "2026-11-18"));
    assert(isEditable(), "the popover is editable");
    assert($(".o_hhg_pop_type input"), "the type is an input");
    await expectButtons(["Delete"], "an Employee's request To Approve");
    assertEqual(writesSince(mark), [], "no write");
});

fromList("hhg_a15_save", async () => {
    await openManagement();
    await openPopoverOf(pillOn(ROLE_EMP, "2026-11-18"));
    await typeDescription("Dentist");
    await realClick($(".o_hhg_pop_title"));
    await expectButtons(["Save", "Discard"], "a pending change");
    const open = popover();
    await pressButton("Save");
    await expectButtons(["Delete"], "after Save");
    await written();
    assert(popover() === open, "the popover stays open");
    assert(isEditable(), "and editable");
    assertEqual($(".o_hhg_pop textarea").value, "Dentist", "the description");
    assert(pillOn(ROLE_EMP, "2026-11-18").classList.contains("o_tl_striped"), "still To Approve");
});

// A31, A32, A33: the report view's popover ---------------------------------------------------------------

async function openReport() {
    await pickRange("week");
    await step(1);
    await dataSettled();
    await settle(500);
}

const reportPill = (name, day) => pillsOf(name).find((pill) => firstDayOf(pill) === day);

scenario("hhg_a31_report_popover", async () => {
    await openReport();
    const mark = noteMark();
    await openPopoverOf(reportPill(ROLE_EMP, "2026-11-19"));
    assert($(".o_hhg_pop_report"), "the report's popover");
    assert(isReadonly(), "read-only");
    assert(!$(".o_hhg_pop input, .o_hhg_pop textarea"), "no input");
    assertEqual(titleOf(), `${ROLE_EMP} - 1 day`, "the title");
    const text = clean($(".o_hhg_pop_content").textContent);
    assert(text.includes("Approved"), `the status badge: "${text}"`);
    await expectButtons(["Delete"], "the report's popover");
    assertEqual(writesSince(mark), [], "no write");
});

scenario("hhg_a32_report_delete_other", async () => {
    await openReport();
    await openPopoverOf(reportPill(PEER, "2026-11-20"));
    await expectButtons(["Delete"], "the report's popover");
    const open = popover();
    await pressButton("Delete");
    const text = await errorText();
    assert(/not allowed|access/i.test(text), `the Community's access error: "${text}"`);
    assert(popover() === open, "the popover stays open under the dialog");
    await closeDialog();
    assert(popover() === open, "and after the dialog");
    assert(reportPill(PEER, "2026-11-20"), "the request is still there");
});

scenario("hhg_a33_report_delete_own", async () => {
    // the browser starts on the server's day; the one request To Approve lies after it, in this
    // week or in the next
    await pickRange("week");
    await dataSettled();
    await settle(500);
    await bringIntoViewFirst(ROLE_EMP);
    await openPopoverOf(pillsOf(ROLE_EMP)[0]);
    await expectButtons(["Delete"], "the report's popover");
    await pressButton("Delete");
    await until(() => !popover(), "the popover closes", 10000);
    await written();
    assertEqual(pillsOf(ROLE_EMP).length, 0, "the pill is gone");
});

/** The week that shows the row's pill: the view's own Next, at most twice. */
async function bringIntoViewFirst(name) {
    for (let attempt = 0; attempt < 3 && !pillsOf(name).length; attempt++) {
        await step(1);
        await dataSettled();
    }
    assert(pillsOf(name).length, `a pill in the row of ${name}`);
}

// A36: Approve by the approver ---------------------------------------------------------------------------

fromList("hhg_a36_approver_approves", async () => {
    await openManagement(PEER);
    await openPopoverOf(pillOn(PEER, "2026-11-16"));
    await expectButtons(["Approve", "Refuse", "Delete"], "the allocated CTO request");
    await pressButton("Approve");
    await until(() => !visibleButtons().includes("Approve"), "Approve is pressed", 10000);
    await written();
    assert(isReadonly(), "the CTO request is read-only after Approve");
    await closeWithEscape();
    await openPopoverOf(pillOn(PEER, "2026-11-17"));
    await expectButtons(["Approve", "Refuse", "Delete"], "the request approved twice");
    await pressButton("Approve");
    await until(() => !visibleButtons().includes("Approve"), "Approve is pressed", 10000);
    await written();
    assert(isReadonly(), "the request is read-only after the first approval");
    await closeWithEscape();
    await openPopoverOf(pillOn(PEER, "2026-11-18"));
    await expectButtons(["Delete"], "the request approved by the Officer");
});

// A53 is above; A54: Delete of a past request by an Employee ----------------------------------------------

fromList("hhg_a54_delete_past", async () => {
    await openManagement(null, { next: false });
    // the browser starts on the server's day: the request lies on the working day before it, in
    // this week or in the one before
    for (let attempt = 0; attempt < 3 && !pillsOf(ROLE_EMP).length; attempt++) {
        await step(-1);
        await dataSettled();
    }
    assert(pillsOf(ROLE_EMP).length, `the past request in the row of ${ROLE_EMP}`);
    await openPopoverOf(pillsOf(ROLE_EMP)[0]);
    await expectButtons(["Delete"], "the Employee's request");
    const open = popover();
    await pressButton("Delete");
    const text = await errorText();
    assert(text.includes("in the past"), `the Community's error about the past: "${text}"`);
    assert(popover() === open, "the popover stays open under the dialog");
    await closeDialog();
    assert(pillsOf(ROLE_EMP).length === 1, "the request is still there");
});

// A77, A78: Refused and Cancelled requests -----------------------------------------------------------------

fromList("hhg_a77_edit_refused", async () => {
    await openManagement(PEER);
    await openPopoverOf(pillOn(PEER, "2026-11-19"));
    assert(isReadonly(), "the Refused request is read-only");
    await expectButtons(["Edit", "Delete"], "Refused");
    await pressButton("Edit");
    await expectButtons(["Approve", "Refuse", "Delete"], "after Edit");
    await written();
    assert(isEditable(), "the popover is editable");
});

fromList("hhg_a78_cancelled", async () => {
    await openManagement(ROLE_EMP);
    const mark = noteMark();
    await openPopoverOf(pillOn(ROLE_EMP, "2026-11-20"));
    assert(isReadonly(), "the Cancelled request is read-only");
    await expectButtons(["Delete"], "Cancelled");
    assertEqual(writesSince(mark), [], "no write");
    assert(loaded(), "the popover has loaded");
});
