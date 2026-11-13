// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Domain } from "@web/core/domain";
import { _t } from "@web/core/l10n/translation";
import {
    ConfirmationDialog,
    deleteConfirmationMessage,
} from "@web/core/confirmation_dialog/confirmation_dialog";
import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";
import { SelectCreateDialog } from "@web/views/view_dialogs/select_create_dialog";
import { creationContext, planWriteValues, rowValueChain } from "./timeline_editing";

/**
 * The record dialog. Community closes the dialog right after `removeRecord` resolves; here the
 * dialog closes only when the record was really removed (`removeRecord` resolves `true`), so that
 * "No, keep it" leaves it open (O2b-4).
 */
export class TimelineRecordDialog extends FormViewDialog {
    setup() {
        super.setup();
        if (this.props.removeRecord) {
            this.viewProps.removeRecord = async () => {
                if (await this.props.removeRecord()) {
                    this.props.close();
                }
            };
        }
    }
}

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
                    if (!this.model.disposed) {
                        await this.model.reload();
                    }
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

    /**
     * R9: the plan dialog for `period`, in `row` when given. Resolves after the dialog (and the
     * create action started from it) has closed and the view has reloaded, if anything changed.
     * @param {{period: {start, stop}, row?: Object|null}} params
     */
    planFor({ period, row = null }) {
        const { model, archInfo, services, env } = this;
        const { dialog, orm } = services;
        const { startField, stopField } = model.config;
        // the search model keeps no search default in its context: take those of the action
        const searchDefaults = Object.fromEntries(
            Object.entries(env.searchModel?.actionContext || {}).filter(([key]) =>
                key.startsWith("search_default_")
            )
        );
        const context = { ...searchDefaults, ...this.creationContextFor({ period, row }) };
        const rowValues = row ? rowValueChain(model.data.rows, row.id, model.fields) : {};
        const actionDomain = env.searchModel?.globalDomain || [];
        const domain = Domain.and([
            Domain.removeDomainLeaves(actionDomain, [startField, stopField]),
            ["|", [startField, "=", false], [stopField, "=", false]],
        ]).toList();
        let written = false;
        let started = null; // the create action run from the dialog
        const plan = async (ids) => {
            const values = planWriteValues({
                period,
                placement: model.placement,
                fields: model.fields,
                rowValues,
                records: ids,
                shownById: model.data.recordsById,
            });
            if (!Object.keys(values).length) {
                return;
            }
            written = true;
            await model.trackWrite(
                orm.write(model.resModel, ids, values, {
                    // R9.4: the write runs with the context of the action and the search, not
                    // with the creation defaults
                    context: model.context,
                })
            );
        };
        const createEdit = () => {
            if (archInfo.onCreate) {
                started = this.createFor({ period, row });
                return;
            }
            // the plan dialog closes only when the record is saved and planned
            return new Promise((resolve) => {
                dialog.add(FormViewDialog, {
                    title: _t("Create"),
                    resModel: model.resModel,
                    viewId: archInfo.formViewId,
                    context: this.creationContextFor({ period, row }),
                    onRecordSaved: async (record) => {
                        await plan([record.resId]);
                        resolve();
                    },
                });
            });
        };
        return new Promise((resolve, reject) => {
            const closed = async () => {
                try {
                    if (written && !model.disposed) {
                        await model.reload();
                    }
                } catch (error) {
                    reject(error);
                    return;
                }
                // the create action runs on after the dialog is gone: do not hold the dialog
                Promise.resolve(started).then(resolve, reject);
            };
            dialog.add(
                SelectCreateDialog,
                {
                    title: _t("Plan"),
                    resModel: model.resModel,
                    domain,
                    context,
                    noCreate: !archInfo.canCellCreate,
                    onSelected: plan,
                    onCreateEdit: createEdit,
                },
                { onClose: closed }
            );
        });
    }

    /**
     * R10: the record dialog of `resId`, once the writes the view still sends are done. Editable
     * (with Remove, R12) by the permissions; read-only otherwise. Resolves after the dialog has
     * closed and the view has reloaded.
     * @param {number} resId
     */
    async openRecord(resId) {
        // one record dialog at a time: a second call while one is pending or open does nothing
        if (this._recordOpen) {
            return;
        }
        this._recordOpen = true;
        try {
            await this.model.whenWritesDone();
        } catch (error) {
            this._recordOpen = false;
            throw error;
        }
        const { model, archInfo, services } = this;
        const { dialog, orm } = services;
        const { canEdit, canDelete, formViewId } = archInfo;
        const context = model.context;
        const removeRecord = async () => {
            let deleted = false;
            await new Promise((resolve) => {
                dialog.add(
                    ConfirmationDialog,
                    {
                        // the Community's own record-deletion texts (what `useDeleteRecords` gives);
                        // the title is not exported, so its source string is repeated to share the
                        // Community translation
                        title: _t("Bye-bye, record!"),
                        body: deleteConfirmationMessage,
                        confirmLabel: _t("Delete"),
                        confirmClass: "btn-danger",
                        cancelLabel: _t("No, keep it"),
                        cancel: () => {},
                        confirm: async () => {
                            await orm.unlink(model.resModel, [resId], { context });
                            deleted = true;
                        },
                    },
                    { onClose: resolve }
                );
            });
            return deleted;
        };
        return new Promise((resolve, reject) => {
            dialog.add(
                TimelineRecordDialog,
                {
                    title: _t("Open"),
                    resModel: model.resModel,
                    resId,
                    viewId: formViewId,
                    context,
                    readonly: !canEdit,
                    preventEdit: !canEdit,
                    removeRecord: canEdit && canDelete ? removeRecord : undefined,
                },
                {
                    onClose: async () => {
                        this._recordOpen = false;
                        try {
                            if (!model.disposed) {
                                await model.reload();
                            }
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    },
                }
            );
        });
    }
}
