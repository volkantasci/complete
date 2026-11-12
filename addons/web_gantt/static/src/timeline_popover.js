// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Component, t, useProps } from "@odoo/owl";
import { toLocaleDateString, toLocaleDateTimeString } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { createElement, parseXML } from "@web/core/utils/xml";
import { CARD_ATTRIBUTE } from "@web/views/card/card_arch_parser";
import { CardPopover } from "@web/views/card/card_popover/card_popover";

/** Delay between a click on a pill and its popover, so that a double click can cancel it (R30). */
export const POPOVER_DELAY = 200;

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

function escapeText(text) {
    return String(text).replace(/[&<>"]/g, (char) => ESCAPES[char]);
}

/**
 * The popover of a pill: the Community card popover, filled with the popover element of the view
 * (body, header and footer templates, card view) or with the default content (start and stop).
 * On a small screen the stylesheet makes the same popover a sheet.
 */
export class TimelinePopover extends Component {
    static template = "web_gantt.TimelinePopover";
    static components = { CardPopover };
    props = useProps({
        close: t.function(),
        model: t.object(),
        archInfo: t.object(),
        record: t.object(),
    });

    setup() {
        this.ui = useService("ui");
    }

    get canEdit() {
        return this.props.archInfo.canEdit;
    }

    get buttonLabel() {
        return this.canEdit ? _t("Edit") : _t("View");
    }

    get cardPopoverProps() {
        const { model, record } = this.props;
        return {
            close: this.props.close,
            fields: model.fields,
            resModel: model.resModel,
            resId: record.resId,
            popoverNode: this.popoverNode,
            readonly: !this.canEdit,
            // a small screen turns the popover into a sheet (see the stylesheet)
            rootClass: this.ui.isSmall ? "o_tl_popover o_tl_popover_sheet" : "o_tl_popover",
            context: model.context,
            reloadOnClose: () => model.reload(),
            getDefaultPopoverBody: () => this.getDefaultPopoverBody(),
        };
    }

    /** The popover element of the view, rebuilt as a fresh node the card popover may alter. */
    get popoverNode() {
        const { popover } = this.props.archInfo;
        const node = createElement("popover");
        if (!popover) {
            return node;
        }
        if (popover.cardId) {
            node.setAttribute("card_id", popover.cardId);
        }
        for (const name of popover.fields) {
            node.appendChild(createElement("field", { name }));
        }
        const templates = createElement("templates");
        for (const template of Object.values(popover.templates)) {
            templates.appendChild(template.cloneNode(true));
        }
        node.appendChild(templates);
        return node;
    }

    /**
     * A date field shows the date only, a datetime field date and time, both in the short form of
     * the Community popovers ("Nov 12, 9:00 AM"; the year only when it is not the current one).
     */
    formatValue(fieldName, value) {
        if (!value) {
            return "";
        }
        return this.props.model.fields[fieldName]?.type === "date"
            ? toLocaleDateString(value)
            : toLocaleDateTimeString(value);
    }

    getDefaultPopoverBody() {
        const { archInfo, record } = this.props;
        const line = (label, fieldName, value) =>
            `<div class="o_tl_popover_line"><b>${escapeText(label)}</b>: ${escapeText(
                this.formatValue(fieldName, value)
            )}</div>`;
        const lines = [
            line(_t("Start"), archInfo.startField, record.start),
            line(_t("Stop"), archInfo.stopField, record.stop),
        ];
        return parseXML(`<t t-name="${CARD_ATTRIBUTE}">${lines.join("")}</t>`);
    }

    /** The button opens the record in a later slice; it does nothing here. */
    onButtonClick() {}
}
