// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onWillStart } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { formView } from "@web/views/form/form_view";
import { FormController } from "@web/views/form/form_controller";

/**
 * The form of the track dialog of the Gantt view. Its footer follows the rights of the user on
 * tracks (read in the browser), not their groups: Save and Unschedule need the write right (Save
 * of a new track needs the create right), Delete needs the delete right, Discard is always there.
 */
export class TrackDialogFormController extends FormController {
    setup() {
        super.setup();
        this.rights = { write: false, create: false, unlink: false };
        this.unscheduleLabel = _t("Unschedule");
        this.unscheduleParams = { type: "object", name: "action_unschedule", close: true };
        onWillStart(async () => {
            const check = (operation) => user.checkAccessRight(this.props.resModel, operation);
            const [write, create, unlink] = await Promise.all([
                check("write"),
                check("create"),
                check("unlink"),
            ]);
            this.rights = { write, create, unlink };
            if (this.props.resId && !write) {
                // no write right: the form of an existing track is read only
                this.canEdit = false;
            }
        });
    }

    get isNewTrack() {
        return this.model.root.isNew;
    }

    get showSave() {
        return this.canEdit && (this.isNewTrack ? this.rights.create : this.rights.write);
    }

    get showUnschedule() {
        return this.canEdit && !this.isNewTrack && this.rights.write;
    }

    get showDelete() {
        // the view's own delete option (002b) reaches the dialog as `removeRecord`
        return (
            this.canEdit && !this.isNewTrack && this.rights.unlink && !!this.props.removeRecord
        );
    }

    /** Ask, then save what is pending, delete the track and close the dialog. */
    onDeleteClicked() {
        this.dialogService.add(ConfirmationDialog, {
            title: _t("Delete Track"),
            body: _t("Should this track really be deleted?"),
            confirmLabel: _t("Delete"),
            cancelLabel: _t("Discard"),
            cancel: () => {},
            confirm: async () => {
                const record = this.model.root;
                // an invalid form stays open, with its validation shown, and nothing is deleted
                if ((await record.save({ reload: false })) === false) {
                    return;
                }
                await this.orm.unlink(record.resModel, [record.resId], {
                    context: this.props.context,
                });
                this.env.dialogData.close();
            },
        });
    }
}

export const trackDialogFormView = {
    ...formView,
    Controller: TrackDialogFormController,
    // the dialog hands its own button template down: this one takes its place
    props: (genericProps, view, config) => ({
        ...formView.props(genericProps, view, config),
        buttonDialogTemplate: "website_event_track_gantt.DialogButtons",
    }),
};

registry.category("views").add("track_dialog_form", trackDialogFormView);
