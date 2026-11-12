// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, onWillUnmount, proxy, signal, t, useProps } from "@odoo/owl";
import { DateTimeInput } from "@web/core/datetime/datetime_input";
import { DateTimePicker } from "@web/core/datetime/datetime_picker";
import { Dialog } from "@web/core/dialog/dialog";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { formatDate } from "@web/core/l10n/dates";
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
    };
    props = useProps({
        ...standardViewProps,
        Model: t.function(),
        Renderer: t.function(),
        archInfo: t.object(),
    });

    rootRef = signal.ref();

    setup() {
        this.ui = useService("ui");
        this.dialog = useService("dialog");
        this.model = useModel(this.props.Model, {
            resModel: this.props.resModel,
            fields: this.props.fields,
            config: this.props.archInfo,
            viewId: this.env.config.viewId,
            state: this.props.state?.modelState,
        });
        // coming back from another view of the action restores range, display mode and scroll
        // position (R39); collapsed rows are not kept
        useSetupAction({
            rootRef: this.rootRef,
            getLocalState: () => ({ modelState: this.model.getLocalState() }),
        });
        onWillUnmount(() => this.model.dispose());
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
    // State read by the template
    // ------------------------------------------------------------------------

    get data() {
        return this.model.data;
    }

    /** The range shown in the bar: the target of a pending step, else the loaded one. */
    get shownRange() {
        return this.data.pendingRange || this.data.range;
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

    onNew() {
        // Creation belongs to a later slice; the button only renders.
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

    applyCustom() {
        const { start, stop, edited } = this.custom;
        this.rangeMenu.close();
        return this.model.applyCustom(start, stop, { edited });
    }
}
