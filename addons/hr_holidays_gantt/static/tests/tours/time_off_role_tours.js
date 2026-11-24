// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { registry } from "@web/core/registry";
import {
    $,
    $$,
    assert,
    assertEqual,
    bringIntoView,
    centre,
    clean,
    closeDialog,
    colByDate,
    dataSettled,
    mouse,
    noteMark,
    pickRange,
    pillsOf,
    realClick,
    realHover,
    rectOf,
    rowNames,
    scenario,
    searchFor,
    send,
    settle,
    step,
    texts,
    until,
    writesSince,
} from "@hr_holidays_gantt/../tests/tours/time_off_tours";
import {
    errorText,
    expectButtons,
    fromList,
    isEditable,
    isReadonly,
    openManagement,
    pressButton,
    written,
} from "@hr_holidays_gantt/../tests/tours/time_off_button_tours";
import {
    closeWithEscape,
    firstDayOf,
    openPopoverOf,
    pillOn,
    popover,
} from "@hr_holidays_gantt/../tests/tours/time_off_popover_tours";

/**
 * Tours of the matrix of roles of slice 002e2 (Task 10; A60 to A66): what each role sees in the
 * popover of each state (the buttons by their boxes, editable or read-only, the handles), whether
 * the split tool shows, and which deletions the Community accepts (the request is gone) or refuses
 * (its error dialog over the open popover, the request still there). The records come from
 * `tests/test_role_tours.py` (the *matrix* and *types* states of `acceptance.md`); the clock is
 * Wednesday 11 November 2026 (the deletion tours start on the server's day, since the Community
 * refuses to delete a request in the past for everyone but an Officer), so the Week range after
 * one step reads Sunday 15 to Saturday 21 November.
 */

const tours = registry.category("web_tour.tours");

const OVERVIEW = "/odoo/action-hr_holidays_gantt.action_hr_holidays_overview";
const PEER = "Toff Peer";
const OWN = {
    emp: "Toff Role Emp",
    manager: "Toff Role Manager",
    approver: "Toff Role Approver",
    officer: "Toff Role Officer",
    admin: "Toff Role Admin",
};
// the matrix state's days, by state
const DAY = {
    confirm: "2026-11-16",
    validate1: "2026-11-17",
    validate: "2026-11-18",
    refuse: "2026-11-19",
    cancel: "2026-11-20",
};
// the multi-day request of the split checks (Approved, Monday 23 to Wednesday 25)
const MULTI = "2026-11-23";
const MULTI_BORDERS = ["2026-11-24", "2026-11-25"];
const ONLY_ADMINISTRATORS = /can only be deleted by Administrators/;
const ACCESS = /not allowed|access/i;

// what a cell of the matrix shows ---------------------------------------------------------------------

const editable = (buttons) => ({ editable: true, buttons, handles: 2 });
// (handles: Second Approval and Approved show none, D7; Refused and Cancelled pills are not asserted)
const readonly = (buttons, handles = 0) => ({ editable: false, buttons, handles });

const APPROVE = ["Approve", "Refuse", "Delete"];
const EMPLOYEE_CELLS = {
    confirm: editable(["Delete"]),
    validate1: readonly(["Delete"]),
    validate: readonly(["Delete"]),
    refuse: readonly(["Delete"], null),
    cancel: readonly(["Delete"], null),
};
const OFFICER_OVERVIEW_CELLS = {
    confirm: editable(APPROVE),
    validate1: readonly(["Edit", "Delete"]),
    validate: readonly(["Edit", "Delete"]),
};
const OFFICER_MANAGEMENT_CELLS = {
    ...OFFICER_OVERVIEW_CELLS,
    refuse: readonly(["Edit", "Delete"], null),
    cancel: readonly(["Delete"], null),
};

// the pointer ---------------------------------------------------------------------------------------

/** The pointer rests on a point (no button). */
async function restAt(x, y) {
    await send({ events: [mouse("mouseMoved", x, y, { button: "none", buttons: 0 })] });
    await settle(300);
}

const centreY = (pill) => {
    const rect = rectOf(pill);
    return rect.top + rect.height / 2;
};

/** The width of one day column. */
const dayWidth = () => rectOf(colByDate("2026-11-17")).left - rectOf(colByDate("2026-11-16")).left;

// the rows ------------------------------------------------------------------------------------------

/** Searches the employees by `text` and waits for exactly these rows (in any order). */
async function openRows(text, expected) {
    await searchFor(text);
    const wanted = JSON.stringify([...expected].sort());
    await until(
        () => JSON.stringify([...rowNames()].sort()) === wanted,
        `the rows ${wanted}: ${JSON.stringify(rowNames())}`,
        8000
    );
    await dataSettled();
    await settle(500);
}

/** The Week range of 15 to 21 November of the Overview, with the rows of the search. */
async function openOverviewRows(text, expected) {
    await pickRange("week");
    await step(1);
    await openRows(text, expected);
}

// the popover of a cell -----------------------------------------------------------------------------

/**
 * Opens the popover of the pill of `name` at `state` and checks what the user sees: editable or
 * read-only (the type is an input or a link), the buttons by their boxes, the handles at rest.
 */
async function checkCell(name, state, want) {
    const day = DAY[state];
    const label = `${name}, ${state}`;
    const pill = pillOn(name, day);
    assert(pill, `${label}: the request of ${day} shows`);
    await bringIntoView(pill);
    await realHover(pill);
    await settle(300);
    if (want.handles !== null) {
        assertEqual($$(".o_tl_handle").length, want.handles, `${label}: the handles`);
    }
    const mark = noteMark();
    await openPopoverOf(pill);
    assert(!$(".o_hhg_pop_report"), `${label}: the leave view's form`);
    if (want.editable) {
        assert(isEditable(), `${label}: the popover is editable`);
        assert($(".o_hhg_pop_type input"), `${label}: the type is an input`);
    } else {
        assert(isReadonly(), `${label}: the popover is read-only`);
        assert($(".o_hhg_pop_type a"), `${label}: the type is a link`);
        assert(!$(".o_hhg_pop_type input"), `${label}: the type is no input`);
    }
    await expectButtons(want.buttons, label);
    assertEqual(writesSince(mark), [], `${label}: no write`);
    await closeWithEscape();
}

/** Toff Peer has no Cancelled request in the *matrix* state (only the role user's employee has). */
async function checkCells(name, cells) {
    for (const [state, want] of Object.entries(cells)) {
        if (name === PEER && state === "cancel") {
            continue;
        }
        await checkCell(name, state, want);
    }
}

/** A state whose pill the view does not show. */
function assertAbsent(name, states) {
    for (const state of states) {
        assert(!pillOn(name, DAY[state]), `${name}: no pill for ${state} (${DAY[state]})`);
    }
}

// deletions -----------------------------------------------------------------------------------------

/** Delete is refused: the Community's error over the open popover, the request still there. */
async function deleteRefused(name, state, pattern = ONLY_ADMINISTRATORS) {
    await openPopoverOf(pillOn(name, DAY[state]));
    await refuseDelete(name, `${name}, ${state}`, pattern, () => pillOn(name, DAY[state]));
}

/** The open popover's Delete is pressed and refused; `still()` finds the request's pill. */
async function refuseDelete(name, label, pattern, still) {
    const open = popover();
    await pressButton("Delete");
    const text = await errorText();
    assert(pattern.test(text), `${label}: the Community's error: "${text}"`);
    assert(popover() === open && open.isConnected, `${label}: the popover stays open under the dialog`);
    await closeDialog();
    assert(popover() === open, `${label}: and after the dialog`);
    assert(still(), `${label}: the request is still there`);
    await closeWithEscape();
}

/** Delete is accepted: the popover closes, the pill is gone after the reload. */
async function deleteAccepted(name, state) {
    const label = `${name}, ${state}`;
    await openPopoverOf(pillOn(name, DAY[state]));
    await pressButton("Delete");
    await until(() => !popover(), `${label}: the popover closes`, 10000);
    await written();
    assert(!$(".modal"), `${label}: no error dialog`);
    assert(!pillOn(name, DAY[state]), `${label}: the pill is gone`);
}

// the split tool ------------------------------------------------------------------------------------

/**
 * The split tool on the multi-day request of `name` (Monday 23 to Wednesday 25 November, on the next
 * week): for an Officer and an Admin it shows 2 px right of an inner border; for the others no
 * element of the tool shows, and a click there opens the popover.
 */
async function splitToolCheck(name, wanted) {
    await step(1);
    await dataSettled();
    await settle(500);
    const pill = pillOn(name, MULTI);
    assert(pill, `${name}: the multi-day request of ${MULTI}`);
    await bringIntoView(pill);
    const mark = noteMark();
    for (const day of MULTI_BORDERS) {
        const x = rectOf(colByDate(day)).left + 2;
        const y = centreY(pillOn(name, MULTI));
        await restAt(x, y);
        if (wanted) {
            assert($(".o_hhg_split_tool"), `${name}: the split tool shows 2 px right of the border of ${day}`);
        } else {
            assertEqual($$("[class*='o_hhg_split']").length, 0, `${name}: no split element at the border of ${day}`);
        }
    }
    if (!wanted) {
        const x = rectOf(colByDate(MULTI_BORDERS[0])).left + 2;
        await realClick(null, { at: { x, y: centreY(pillOn(name, MULTI)) } });
        await until(() => popover() && $(".o_hhg_pop_title")?.textContent, `${name}: a click there opens the popover`, 8000);
        assert(!$(".o_notification"), `${name}: no notification`);
        await closeWithEscape();
    }
    assertEqual(writesSince(mark), [], `${name}: no write`);
    await step(-1);
    await dataSettled();
    await settle(500);
}

// a press and a drag in the report view -------------------------------------------------------------

/** A press, a drag one day over and a release: nothing opens, moves or is written. */
async function dragMovesNothing(name, day) {
    const label = `${name}, ${day}`;
    const mark = noteMark();
    const pill = pillOn(name, day);
    await bringIntoView(pill);
    const from = centre(pill);
    const width = dayWidth();
    const sign = from.x + 2 * width > window.innerWidth ? -1 : 1;
    const end = { x: from.x + sign * width, y: from.y };
    await send({
        events: [
            mouse("mouseMoved", from.x, from.y, { button: "none", buttons: 0 }),
            mouse("mousePressed", from.x, from.y, { buttons: 1, clickCount: 1 }),
            mouse("mouseMoved", from.x + sign * 30, from.y, { buttons: 1 }),
            mouse("mouseMoved", (from.x + end.x) / 2, from.y, { buttons: 1 }),
            mouse("mouseMoved", end.x, end.y, { buttons: 1 }),
        ],
    });
    await settle(400);
    await send({ events: [mouse("mouseReleased", end.x, end.y, { buttons: 0, clickCount: 1 })] });
    await settle(1000);
    assert(!$(".o_tl_pill_moved"), `${label}: no raised pill`);
    assert(!popover(), `${label}: no popover`);
    assert(!$(".modal"), `${label}: no dialog`);
    assert(!$(".o_notification"), `${label}: no notification`);
    assert(pillOn(name, day), `${label}: the request is where it was`);
    assertEqual(writesSince(mark), [], `${label}: no write`);
}

// A60: no role ------------------------------------------------------------------------------------------

tours.add("hhg_a60_no_role", {
    steps: () => [
        {
            trigger: ".o_home_menu",
            timeout: 60000,
            expectUnloadPage: true,
            async run() {
                await settle(1000);
                const apps = texts(".o_home_menu .o_app");
                assert(apps.length, "the home menu shows applications");
                assert(!apps.includes("Time Off"), `Time Off is not in the home menu: ${JSON.stringify(apps)}`);
                window.location.assign(OVERVIEW);
            },
        },
        {
            trigger: ".modal",
            timeout: 60000,
            async run() {
                await settle(800);
                const text = clean($(".modal").textContent);
                assert(/not allowed to access/i.test(text), `the Community's access error: ${text}`);
                assert(!$(".o_tl_renderer"), "no Gantt view behind the error");
                assert(!popover(), "no popover can be reached");
            },
        },
    ],
});

// A61, A62: Employee and Manager without approval ---------------------------------------------------------

/** Their popovers by state, the refused deletions and no split tool (Management > Time Off). */
function employeeTours(id, key) {
    const name = OWN[key];
    fromList(`hhg_${id}_${key}_popovers`, async () => {
        await openManagement();
        // only their own requests: Toff Peer's row does not show
        await openRows("Toff", [name]);
        assert(!rowNames().includes(PEER), "Toff Peer's requests do not show");
        await checkCells(name, EMPLOYEE_CELLS);
        // the Community's rule gives the Employee the right to delete To Approve and Second
        // Approval only: any other state is its access error
        for (const state of ["validate", "refuse", "cancel"]) {
            await deleteRefused(name, state, ACCESS);
        }
        await splitToolCheck(name, false);
    });
    // the accepted deletions use records of the days after the server's day, one each
    fromList(`hhg_${id}_${key}_deletes`, async () => {
        await openManagement(null, { next: false });
        await deleteInOrder(name, [{ editable: true }, { editable: false }]);
        await cancelledStays(name);
    });
}

/** The Cancelled request is left: its Delete gives the access error (the Community's rule). */
async function cancelledStays(name) {
    const pill = await firstPill(name);
    await openPopoverOf(pill);
    assert(!isEditable(), `${name}: the Cancelled request is read-only`);
    await expectButtons(["Delete"], `${name}, Cancelled`);
    await refuseDelete(name, `${name}, Cancelled`, ACCESS, () => pillsOf(name).length === 1);
}

/** The first pill of the row, on this week or the following ones. */
async function firstPill(name) {
    for (let attempt = 0; attempt < 3 && !pillsOf(name).length; attempt++) {
        await step(1);
        await dataSettled();
    }
    assert(pillsOf(name).length, `a pill in the row of ${name}`);
    return pillsOf(name).sort((a, b) => rectOf(a).left - rectOf(b).left)[0];
}

/** Deletes the requests of the row one after the other, in the order of their days. */
async function deleteInOrder(name, wanted) {
    for (const [index, want] of wanted.entries()) {
        const label = `${name}, request ${index + 1}`;
        await openPopoverOf(await firstPill(name));
        assertEqual(isEditable(), want.editable, `${label}: editable`);
        await expectButtons(["Delete"], label);
        const open = popover();
        await pressButton("Delete");
        await until(() => !popover() || !open.isConnected, `${label}: the popover closes`, 10000);
        assert(!$(".modal"), `${label}: no error dialog`);
        await written();
    }
}

employeeTours("a61", "emp");
employeeTours("a62", "manager");

// A63: Approver --------------------------------------------------------------------------------------------

fromList("hhg_a63_approver_types", async () => {
    await openManagement();
    await openRows(PEER, [PEER]);
    const name = PEER;
    // the day of each type's request (the *types* state): CTO 16, UN 17, STO 18
    const cell = async (day, want, label) => {
        const pill = pillOn(name, day);
        assert(pill, `${label}: the request of ${day}`);
        await bringIntoView(pill);
        await realHover(pill);
        await settle(300);
        assertEqual($$(".o_tl_handle").length, want.handles, `${label}: the handles`);
        await openPopoverOf(pill);
        assert(isEditable(), `${label}: editable`);
        assert($(".o_hhg_pop_type input"), `${label}: the type is an input`);
        await expectButtons(want.buttons, label);
        await closeWithEscape();
    };
    await cell(DAY.confirm, editable(APPROVE), "CTO, approved by the manager");
    await cell(DAY.validate1, editable(APPROVE), "UN, approved twice");
    await cell(DAY.validate, editable(["Delete"]), "STO, approved by the Officer");
    // Delete of an employee's request: the Community's access error, the request still there
    await deleteRefused(name, "validate", ACCESS);
    await splitToolCheck(name, false);
});

fromList("hhg_a63_approver_matrix", async () => {
    await openManagement();
    const own = OWN.approver;
    await openRows("Toff", [PEER, own]);
    for (const name of [own, PEER]) {
        await checkCells(name, EMPLOYEE_CELLS);
    }
    for (const state of ["validate", "refuse", "cancel"]) {
        await deleteRefused(own, state, ACCESS);
    }
    await deleteRefused(PEER, "validate", ACCESS);
    await splitToolCheck(own, false);
    await splitToolCheck(PEER, false);
});

fromList("hhg_a63_approver_deletes", async () => {
    await openManagement(null, { next: false });
    // their own requests: To Approve and Second Approval accepted, the Cancelled one refused
    await deleteInOrder(OWN.approver, [{ editable: true }, { editable: false }]);
    await cancelledStays(OWN.approver);
});

// A64, A65: Officer and Admin ------------------------------------------------------------------------------------

/**
 * The Overview: To Approve, Second Approval and Approved of their own row and Toff Peer's (the
 * Refused and Cancelled requests do not show), the split tool, the deletions of `accepted` own
 * states (the others refused).
 */
function overviewTour(id, key, accepted) {
    const own = OWN[key];
    scenario(`hhg_${id}_${key}_overview`, async () => {
        await openOverviewRows("Toff", [PEER, own]);
        for (const name of [own, PEER]) {
            await checkCells(name, OFFICER_OVERVIEW_CELLS);
            assertAbsent(name, ["refuse", "cancel"]);
        }
        for (const state of ["confirm", "validate1", "validate"]) {
            if (!accepted.includes(state)) {
                await deleteRefused(own, state);
            }
        }
        for (const state of accepted) {
            await deleteAccepted(own, state);
        }
        await splitToolCheck(own, true);
        await splitToolCheck(PEER, true);
    });
}

/** Management > Time Off: the Refused and the Cancelled requests too. */
function managementTour(id, key, accepted) {
    const own = OWN[key];
    fromList(`hhg_${id}_${key}_management`, async () => {
        await openManagement();
        await openRows("Toff", [PEER, own]);
        for (const name of [own, PEER]) {
            await checkCells(name, OFFICER_MANAGEMENT_CELLS);
        }
        for (const state of ["refuse", "cancel"]) {
            if (!accepted.includes(state)) {
                await deleteRefused(own, state);
            }
        }
        for (const state of accepted) {
            await deleteAccepted(own, state);
        }
    });
}

overviewTour("a64", "officer", ["confirm"]);
managementTour("a64", "officer", ["cancel"]);
overviewTour("a65", "admin", ["confirm", "validate1", "validate"]);
managementTour("a65", "admin", ["refuse", "cancel"]);

// A66: the report view -----------------------------------------------------------------------------------------

/** Every popover of the report view: its form, Delete alone, no handle, and a drag moves nothing. */
function reportTour(key) {
    const own = OWN[key];
    scenario(`hhg_a66_report_${key}`, async () => {
        await openOverviewRows("Toff", [PEER, own]);
        for (const name of [own, PEER]) {
            const days = pillsOf(name).map(firstDayOf);
            for (const state of ["confirm", "validate1", "validate"]) {
                assert(days.includes(DAY[state]), `${name}: the request ${state} shows in ${JSON.stringify(days)}`);
            }
            assert(!days.includes(DAY.refuse), `${name}: the Refused request does not show`);
            for (const day of days) {
                const label = `${name}, ${day}`;
                const pill = pillOn(name, day);
                await bringIntoView(pill);
                await realHover(pill);
                await settle(300);
                assertEqual($$(".o_tl_handle").length, 0, `${label}: no handle`);
                const mark = noteMark();
                await openPopoverOf(pill);
                assert($(".o_hhg_pop_report"), `${label}: the report's form`);
                assert(isReadonly(), `${label}: read-only`);
                assert(!$(".o_hhg_pop input, .o_hhg_pop textarea"), `${label}: no input`);
                await expectButtons(["Delete"], label);
                assertEqual(writesSince(mark), [], `${label}: no write`);
                await closeWithEscape();
                await dragMovesNothing(name, day);
            }
        }
    });
}

for (const key of ["emp", "approver", "manager"]) {
    reportTour(key);
}
