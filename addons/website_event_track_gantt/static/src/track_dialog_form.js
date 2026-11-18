// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { registry } from "@web/core/registry";
import { formView } from "@web/views/form/form_view";
import { FormController } from "@web/views/form/form_controller";
import { executeButtonCallback } from "@web/views/view_button/view_button_hook";

/**
 * The form of the track dialog of the Gantt view. Its footer follows the rights of the user on
 * tracks (as the server's arch tells), not their groups: Save and Unschedule need the write right (Save
 * of a new track needs the create right), Delete needs the delete right, Discard is always there.
 */
export class TrackDialogFormController extends FormController {
    setup() {
        super.setup();
        // the server sets create, edit and delete of the form's root to false when the user lacks
        // the create, write or delete right on tracks: they are the rights, as D3 reads them
        const { create, edit, delete: unlink } = this.archInfo.activeActions;
        this.rights = { write: edit, create, unlink };
        this.unscheduleLabel = _t("Unschedule");
        this.unscheduleParams = { type: "object", name: "action_unschedule", close: true };
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

    /**
     * Ask, then save what is pending, delete the track and close the dialog. While the
     * confirmation is open the buttons of the record dialog are disabled, as the Community does
     * while a button of a form runs (R13, M39); they come back when it closes (M40).
     */
    onDeleteClicked() {
        const dialogEl = this.ui.activeElement;
        // the half opacity belongs to this state only, not to every disabled button (M39)
        dialogEl.classList.add("o_track_confirming");
        return executeButtonCallback(
            dialogEl,
            () =>
                new Promise((resolve) => {
                    this.dialogService.add(
                        ConfirmationDialog,
                        {
                            title: _t("Delete Track"),
                            body: _t("Should this track really be deleted?"),
                            confirmLabel: _t("Delete"),
                            cancelLabel: _t("Discard"),
                            cancel: () => {},
                            confirm: () => this.deleteTrack(),
                        },
                        { onClose: resolve }
                    );
                })
        ).finally(() => dialogEl.classList.remove("o_track_confirming"));
    }

    async deleteTrack() {
        const record = this.model.root;
        // an invalid form stays open, with its validation shown, and nothing is deleted
        if ((await record.save({ reload: false })) === false) {
            return;
        }
        try {
            await this.orm.unlink(record.resModel, [record.resId], {
                context: this.props.context,
            });
        } finally {
            // a refused deletion shows the Community error (the rejection goes on); the dialog
            // closes either way, so that the view reloads with the stored values
            this.env.dialogData.close();
        }
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
