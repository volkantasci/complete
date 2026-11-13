// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";
import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";
import { creationContext, rowValueChain } from "./timeline_editing";

/**
 * Owns the dialogs and the writes of the timeline view. Every method returns a promise that
 * settles once the dialog or action has closed and the view has reloaded.
 */
export class TimelineEditor {
    /**
     * @param {Object} params
     * @param {Object} params.env
     * @param {import("./timeline_model").TimelineModel} params.model
     * @param {Object} params.archInfo
     * @param {{dialog, action, orm, notification}} params.services
     */
    constructor({ env, model, archInfo, services }) {
        this.env = env;
        this.model = model;
        this.archInfo = archInfo;
        this.services = services;
    }

    /** R6: the context of a creation for `period`, in `row` when given. */
    creationContextFor({ period, row = null }) {
        const { model } = this;
        const rowValues = row ? rowValueChain(model.data.rows, row.id, model.fields) : {};
        return creationContext({
            baseContext: model.context,
            period,
            placement: model.placement,
            fields: model.fields,
            rowValues,
        });
    }

    /**
     * R3: run the create action of the view, or open the create dialog, with the defaults of
     * R6. Resolves after the action or dialog has closed and the view has reloaded.
     * @param {{period: {start, stop}, row?: Object|null}} params
     */
    createFor({ period, row = null }) {
        const context = this.creationContextFor({ period, row });
        const { onCreate, formViewId } = this.archInfo;
        const { dialog, action } = this.services;
        return new Promise((resolve, reject) => {
            const closed = async () => {
                try {
                    await this.model.reload();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            if (onCreate) {
                Promise.resolve(
                    action.doAction(onCreate, { additionalContext: context, onClose: closed })
                ).catch(reject);
            } else {
                dialog.add(
                    FormViewDialog,
                    {
                        title: _t("Create"),
                        resModel: this.model.resModel,
                        viewId: formViewId,
                        context,
                    },
                    { onClose: closed }
                );
            }
        });
    }
}
