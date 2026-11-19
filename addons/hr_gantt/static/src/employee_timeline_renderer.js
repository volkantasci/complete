// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { AvatarCard } from "@mail/core/web/avatar_card/avatar_card";
import { usePopover } from "@web/core/popover/popover_hook";
import { imageUrl } from "@web/core/utils/urls";
import { TimelineRenderer } from "@web_gantt/timeline_renderer";
import { diagonalBackground } from "./employee_layout";

/** The models an employee field points to; the card and the image use the public record (R5). */
const EMPLOYEE_MODELS = ["hr.employee", "hr.employee.public"];
const PUBLIC_MODEL = "hr.employee.public";

/**
 * The renderer of the employee variant: avatar row headers and their card (R4, R5) and the
 * diagonal shading of half-day cells (R7).
 */
export class EmployeeTimelineRenderer extends TimelineRenderer {
    static template = "hr_gantt.EmployeeTimelineRenderer";

    setup() {
        super.setup();
        this.avatarCard = usePopover(AvatarCard);
    }

    /**
     * R4: the name of the view's employee field, the only field whose rows get avatars (a
     * Manager grouping keeps 002a's look). A variant of another model overrides it.
     */
    get employeeField() {
        return "employee_id";
    }

    /**
     * R4: the employee a row stands for, `{id, name}`, or null for rows of another field and for
     * the empty-value row. Group rows count too (every level of the grouping).
     */
    employeeOf(descriptor) {
        const row = descriptor.row;
        if (row.fieldName !== this.employeeField || !row.resId || row.isEmptyValueRow) {
            return null;
        }
        const field = this.props.model.fields[row.fieldName];
        if (field?.type !== "many2one" || !EMPLOYEE_MODELS.includes(field.relation)) {
            return null;
        }
        return { id: row.resId, name: row.name };
    }

    /** The classes of a row's name; a variant adds its own (the red name of a contract-less employee). */
    nameClass(_descriptor) {
        return "";
    }

    avatarUrl(employee) {
        return imageUrl(PUBLIC_MODEL, employee.id, "avatar_128");
    }

    /**
     * R5: a click on the avatar never reaches the row header (the template stops it); at
     * 768 px or more it opens the employee card under the avatar, below that nothing.
     */
    onAvatarClick(ev, employee) {
        if (this.ui.isSmall || this.avatarCard.isOpen) {
            return;
        }
        this.avatarCard.open(ev.currentTarget, { id: employee.id, model: PUBLIC_MODEL });
    }

    /** The cell of a row; a diagonal (split) cell gets the class that the stylesheet reads. */
    _cellOf(index, data, covered) {
        const cell = super._cellOf(index, data, covered);
        if (covered && covered.length === 2 && Boolean(covered[0]) !== Boolean(covered[1])) {
            cell.className = `${cell.className} o_hrg_split`.trim();
        }
        return cell;
    }

    /**
     * R7: two halves in different states are shaded along a diagonal, in any column with exactly
     * two parts (half days of a day column, half hours of an hour column).
     */
    partialCellStyle(covered) {
        if (covered.length === 2) {
            const background = diagonalBackground(covered[0], covered[1]);
            if (background) {
                return `background-image: ${background}`;
            }
        }
        return super.partialCellStyle(covered);
    }
}
