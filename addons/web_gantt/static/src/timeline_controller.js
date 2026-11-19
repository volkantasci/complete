// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, onMounted, onPatched, onWillUnmount, proxy, signal, t, useProps } from "@odoo/owl";
import { DateTimeInput } from "@web/core/datetime/datetime_input";
import { DateTimePicker } from "@web/core/datetime/datetime_picker";
import { browser } from "@web/core/browser/browser";
import { Dialog } from "@web/core/dialog/dialog";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { formatDate } from "@web/core/l10n/dates";
import { localization } from "@web/core/l10n/localization";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { useModel } from "@web/model/model";
import { CogMenu } from "@web/search/cog_menu/cog_menu";
import { Layout } from "@web/search/layout";
import { useSetupAction } from "@web/search/action_hook";
import { usePager } from "@web/search/pager_hook";
import { SearchBar } from "@web/search/search_bar/search_bar";
import { useSearchBarToggler } from "@web/search/search_bar/search_bar_toggler";
import { standardViewProps } from "@web/views/standard_view_props";
import { fixCustomDates } from "./timeline_dates";
import { TimelineEditor } from "./timeline_editor";
import { TimelineRescheduleMenu } from "./timeline_reschedule_menu";
import { TimelineSelectionButtons } from "./timeline_selection_buttons";
import { newButtonPeriod } from "./timeline_editing";
import { buildMultiCreateValues } from "./timeline_multi_create";
import { readShowConnectors } from "./timeline_dependency_prefs";
import { hasSidePanel, panelTitleText } from "./timeline_side_panel";

const KIND_LABELS = {
    day: _t("Day"),
    week: _t("Week"),
    month: _t("Month"),
    quarter: _t("Quarter"),
    year: _t("Year"),
};

/**
 * The Community dropdown, except that a click inside the date dialog of the range menu does not
 * close the menu: it stays open while dates are picked (R10), even when the backdrop is clicked.
 */
class TimelineDropdown extends Dropdown {
    popoverCloseOnClickAway(target) {
        if (target.closest?.(".o_dialog")) {
            return false;
        }
        return super.popoverCloseOnClickAway(target);
    }
}

/** The date picker of the custom range line on a phone, in a dialog titled with the role. */
export class TimelineDateDialog extends Component {
    static template = "web_gantt.TimelineDateDialog";
    static components = { DateTimePicker, Dialog };
    props = useProps({
        close: t.function(),
        title: t.string(),
        value: t.any().optional(),
        onPick: t.function(),
    });

    onSelect(value) {
        this.props.onPick(value);
        this.props.close();
    }
}

export class TimelineController extends Component {
    static template = "web_gantt.TimelineController";
    static components = {
        CogMenu,
        DateTimeInput,
        Dropdown: TimelineDropdown,
        DropdownItem,
        Layout,
        SearchBar,
        TimelineRescheduleMenu,
        TimelineSelectionButtons,
    };
    props = useProps({
        ...standardViewProps,
        Model: t.function(),
        Renderer: t.function(),
        Editor: t.function().optional(),
        archInfo: t.object(),
    });

    rootRef = signal.ref();

    setup() {
        this.ui = useService("ui");
        this.dialog = useService("dialog");
        const services = {
            dialog: this.dialog,
            action: useService("action"),
            orm: useService("orm"),
            notification: useService("notification"),
        };
        this.model = useModel(this.props.Model, {
            resModel: this.props.resModel,
            fields: this.props.fields,
            config: this.props.archInfo,
            viewId: this.env.config.viewId,
            actionId: this.env.config.actionId,
            isSmall: () => this.ui.isSmall,
            state: this.props.state?.modelState,
        });
        // what is picked in the grid (002b3 R9): the renderer fills `state` after every change and
        // sets `renderer` while it is mounted (see the comment of the renderer class)
        this.selection = {
            state: proxy({ count: 0, cellCount: 0, drawing: false, visible: false }),
            renderer: null,
        };
        // the switch "Show dependencies" (002c R13), kept per view and action; the renderer draws
        // the arrows by it (`shown`), the menu of the method button toggles it
        this.dependencies = proxy({
            shown: readShowConnectors(this.env.config.viewId, this.env.config.actionId),
        });
        // Escape is registered twice: by the renderer (cells picked, no drawing held) and by the
        // Community buttons (while they show); both call `clearPicked`, which is idempotent, so
        // the order they are reached in does not matter
        this.pickedButtons = this._makePickedButtons();
        const Editor = this.props.Editor || TimelineEditor;
        this.editor = new Editor({
            env: this.env,
            model: this.model,
            archInfo: this.props.archInfo,
            services,
        });
        // coming back from another view of the action restores range, display mode and scroll
        // position (R39); collapsed rows are not kept
        useSetupAction({
            rootRef: this.rootRef,
            getLocalState: () => ({ modelState: this.model.getLocalState() }),
        });
        onWillUnmount(() => this.model.dispose());
        // the list of the records to schedule is read as soon as the panel is possible (the screen
        // may have grown from a phone with the panel remembered closed), open or not: the count
        // before the panel button comes from it
        const readPanel = () => this.hasPanel && this.model.ensurePanel();
        onMounted(readPanel);
        onPatched(readPanel);
        this.searchBarToggler = useSearchBarToggler();
        this.rangeMenu = useDropdownState({ onOpen: () => this.resetCustomLine() });
        this.custom = proxy({ start: null, stop: null, edited: "start" });
        usePager(() => {
            const { groupBy, length, offset, isSample } = this.model.data;
            const limit = this.props.archInfo.groupsLimit;
            if (isSample || !limit || !groupBy.length) {
                return;
            }
            return {
                offset,
                limit,
                total: length,
                onUpdate: ({ offset }) => this.model.setOffset(offset),
            };
        });
    }

    // ------------------------------------------------------------------------
    // The selection buttons (002b3 R8, decision D3)
    // ------------------------------------------------------------------------

    /**
     * The reactive object the Community buttons read. The counts and the visibility come from
     * what the renderer published; the permissions are those of the view (Add: create, Plan: the
     * plan option and edit, with one cell picked, Delete: delete).
     */
    _makePickedButtons() {
        const archInfo = this.props.archInfo;
        const state = this.selection.state;
        const controller = this;
        return proxy({
            get visible() {
                return state.visible;
            },
            get nbSelected() {
                return state.count;
            },
            get canAdd() {
                // the same getter as New: no creation inside a dialog
                return controller.canCreate;
            },
            get canPlan() {
                return archInfo.canPlan && state.cellCount === 1 && controller._pickedHasBlock();
            },
            canDelete: archInfo.canDelete,
            onAdd: (multiCreateData) => this._onPickedAdd(multiCreateData),
            onCancel: () => this.selection.renderer?.clearPicked(),
            onDelete: () => this._onPickedDelete(),
            onPlan: () => this._onPickedPlan(),
            multiCreateView: archInfo.multiCreateView,
            resModel: this.props.resModel,
            context: this.props.context || {},
            get showMultiCreateTimeRange() {
                return controller._pickedShowsTimes;
            },
            multiCreateValues: this.props.state?.multiCreateValues,
        });
    }

    /** Whether the selection has a first block (the cell Plan would plan for). */
    _pickedHasBlock() {
        const block = this.selection.renderer?.firstBlock();
        return Boolean(block);
    }

    /** Plan: 002b's plan dialog for the row and the sub-column of the one picked cell (R13). */
    _onPickedPlan() {
        const renderer = this.selection.renderer;
        const block = renderer?.firstBlock();
        if (!block) {
            return;
        }
        const { row } = renderer.rowOf(block.rowId);
        return this.editor.planFor({
            period: renderer.partPeriod(block.fromPart, block.toPart),
            row,
        });
    }

    /**
     * The popover's Add, once the form and the times are valid (R11): the selection is cleared at
     * once, then one record per picked day and record row goes to the server in one create call
     * (the cell's values win over the form's, decision D4).
     */
    async _onPickedAdd(multiCreateData) {
        const renderer = this.selection.renderer;
        if (!renderer) {
            return;
        }
        const entries = renderer.pickedDays();
        const rows = {};
        for (const { rowId } of entries) {
            rows[rowId] = renderer.rowOf(rowId).values;
        }
        renderer.clearPicked();
        if (!entries.length) {
            return;
        }
        // every field the form shows that is not read-only, as the relational record serializes it
        // for a save: a new record gives all of them, empty values included
        const formValues = await multiCreateData.record.getChanges();
        const { startField, stopField } = this.model.config;
        const valuesList = buildMultiCreateValues({
            formValues,
            entries,
            rows,
            fields: this.props.fields,
            startField,
            stopField,
            timeRange: this._pickedShowsTimes ? multiCreateData.timeRange : null,
            partBounds: (part) => renderer.partPeriod(part, part),
        });
        return this.editor.createMany(valuesList);
    }

    get _pickedShowsTimes() {
        const { startField, stopField } = this.model.config;
        const typeOf = (name) => this.props.fields[name]?.type;
        return typeOf(startField) === "datetime" && typeOf(stopField) === "datetime";
    }

    /**
     * Delete, after the Community confirmation's Ok (R14): the selection is cleared at once,
     * whatever the server answers, then one deletion call of the counted records and the reload.
     * A refusal deletes nothing, shows the Community error and loads nothing again (E2).
     */
    async _onPickedDelete() {
        const renderer = this.selection.renderer;
        const ids = renderer?.pickedRecordIds() || [];
        if (!ids.length) {
            return;
        }
        renderer.clearPicked();
        // awaited here: the write tracking marks the editor's promise as handled and the
        // Community confirmation does not wait for this call, so the refusal is raised again by
        // this promise, which nobody handles: it reaches the Community error handler
        await this.editor.deleteMany(ids);
    }

    // ------------------------------------------------------------------------
    // State read by the template
    // ------------------------------------------------------------------------

    get data() {
        return this.model.data;
    }

    /** The range shown in the bar: the target of a pending step, else the loaded one. */
    get shownRange() {
        return this.data.pendingRange || this.data.range;
    }

    /**
     * The method button and its menu exist (002c R14, R4, R25): a dependency field, no sample
     * data, no phone; the edit permission is not needed. The method a move reads is
     * `rescheduleMethod` (the model's, which takes a choice when the delayed reload runs).
     */
    get hasRescheduleMenu() {
        return (
            Boolean(this.props.archInfo.dependencyField) && !this.data.isSample && !this.ui.isSmall
        );
    }

    get rescheduleMethod() {
        return this.model.rescheduleMethod;
    }

    /** The side panel and its button exist (002b3 R17); none on a phone. */
    get hasPanel() {
        return hasSidePanel({
            archInfo: this.props.archInfo,
            isSmall: this.ui.isSmall,
            isSample: this.data.isSample,
        });
    }

    /** The count text before the panel button while the panel is closed (E6). */
    get panelCountText() {
        const { open, count } = this.model.panel;
        return open ? "" : panelTitleText(count);
    }

    togglePanel() {
        this.model.togglePanel();
    }

    get canCreate() {
        return this.props.archInfo.canCreate && !this.env.inDialog;
    }

    get offeredKinds() {
        return this.props.archInfo.offeredKinds.map((kind) => ({
            kind,
            label: KIND_LABELS[kind],
            isCurrent: this.shownRange.kind === kind,
        }));
    }

    get rangeLabel() {
        const range = this.shownRange;
        return range.kind === "custom" ? null : KIND_LABELS[range.kind];
    }

    formatDay(day) {
        return formatDate(day);
    }

    get displayModeTitle() {
        return this.data.displayMode === "dense"
            ? _t("Show one row per record")
            : _t("Group records on shared rows");
    }

    /** Label of the gear menu entry: what the display mode switches to. */
    get displayModeLabel() {
        return this.data.displayMode === "dense" ? _t("One row per record") : _t("Shared rows");
    }

    get displayModeIcon() {
        return this.data.displayMode === "dense" ? "expand_content" : "close_fullscreen";
    }

    get hasGroupRows() {
        return Boolean(this.data.rows[0]?.isGroup);
    }

    /** True when at least one group row is folded: the button then opens everything. */
    get anyCollapsed() {
        const some = (rows) =>
            rows.some((row) => row.isGroup && (row.collapsed || some(row.children)));
        return this.hasGroupRows && some(this.data.rows);
    }

    get collapseAllTitle() {
        return this.anyCollapsed ? _t("Open every group") : _t("Fold every group");
    }

    get collapseAllIcon() {
        return this.anyCollapsed ? "arrow_right" : "arrow_drop_down";
    }

    // ------------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------------

    /** R2: create for the group unit around the focus date; works in the sample state too. */
    async onNew() {
        // a second click while the create dialog or action is pending or open does nothing
        if (this._newPending) {
            return;
        }
        this._newPending = true;
        try {
            await this._createForNew();
        } finally {
            this._newPending = false;
        }
    }

    _createForNew() {
        // R12: with cells picked, the first block of the selection; the selection stays until the
        // dialog closes (its reload clears it)
        const renderer = this.selection.renderer;
        // (only while the grid is in multi-selection mode: on a phone New follows 002b R2)
        const block =
            renderer?.isMultiSelect && this.selection.state.cellCount ? renderer.firstBlock() : null;
        if (block) {
            return this.editor.createFor({
                period: renderer.partPeriod(block.fromPart, block.toPart),
                row: renderer.rowOf(block.rowId).row,
            });
        }
        const period = newButtonPeriod(
            this.data.scaleId,
            this.model.visibleMiddleDate(),
            localization.weekStart
        );
        return this.editor.createFor({ period });
    }

    step(direction) {
        this.model.step(direction);
    }

    goToday() {
        return this.model.goToday();
    }

    setKind(kind) {
        return this.model.setKind(kind);
    }

    toggleDisplayMode() {
        this.model.toggleDisplayMode();
    }

    toggleCollapseAll() {
        this.model.setAllCollapsed(!this.anyCollapsed);
    }

    resetCustomLine() {
        const { start, stop } = this.shownRange;
        Object.assign(this.custom, { start, stop, edited: "start" });
    }

    /** @param {"start"|"stop"} which */
    onCustomDate(which, value) {
        if (!value || !value.isValid) {
            return;
        }
        const day = value.startOf("day");
        const dates = fixCustomDates(
            which === "start" ? day : this.custom.start,
            which === "stop" ? day : this.custom.stop,
            which
        );
        Object.assign(this.custom, dates, { edited: which });
    }

    /** @param {"start"|"stop"} which */
    openDateDialog(which) {
        this.dialog.add(TimelineDateDialog, {
            title: String(
                which === "start"
                    ? _t("Start date of the timeline")
                    : _t("Stop date of the timeline")
            ),
            value: this.custom[which],
            onPick: (value) => this.onCustomDate(which, value),
        });
    }

    /**
     * The Community picker selects the text of a date input when it opens; the date of the
     * custom line stays unselected (the caret goes to the end), once the picker has settled.
     */
    keepDateUnselected(ev) {
        const input = ev.target;
        if (!(input instanceof HTMLInputElement)) {
            return;
        }
        const collapse = () => {
            const end = input.value.length;
            // only the select-all of the opening is undone, not a selection of the user
            if (end && input.selectionStart === 0 && input.selectionEnd === end) {
                input.setSelectionRange(end, end);
            }
        };
        // two frames: the picker selects the text after the focus event, in a frame of its own;
        // a single frame would run before that selection and be overwritten by it
        browser.requestAnimationFrame(() => browser.requestAnimationFrame(collapse));
    }

    applyCustom() {
        const { start, stop, edited } = this.custom;
        this.rangeMenu.close();
        return this.model.applyCustom(start, stop, { edited });
    }
}
