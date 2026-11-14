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
        // the Community notifications are global: this view's go when the view is left
        model.onDispose(() => this.closeNotification());
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
        let createOpened = false; // the create dialog of Create New was used, saved or not
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
            // R15: after the writes sent before
            await model.queueWrite(() =>
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
            createOpened = true;
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
                    if ((written || createOpened) && !model.disposed) {
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
     * R5, R7, R8, R10, R15: send a move, a resize or a copy whose values are computed, then
     * reload and tell the user. The write waits for the writes sent before.
     * - `values` empty: nothing is sent, shown or reloaded, resolves `false` (D3).
     * - accepted: the view reloads, then the success notification with Undo shows (D6); a copy
     *   that was accepted reloads too. Resolves `true`.
     * - refused (the call rejects): move and resize reload (the pill is drawn from its stored
     *   values), a copy reloads nothing; the rejection is passed on, so that the Community error
     *   shows when the caller does not catch it.
     * @param {Object} change
     * @param {"move"|"copy"|"resize"} change.kind
     * @param {number} change.resId the moved or resized record, the duplicated one for a copy
     * @param {Object} change.values written values; defaults of the duplicate for a copy
     * @param {{values: Object}} [change.undo] what Undo gives back (`undoValues`)
     * @returns {Promise<boolean>}
     */
    async applyChange({ kind, resId, values, undo }) {
        if (!values || !Object.keys(values).length) {
            return false;
        }
        const { model, services } = this;
        const { orm } = services;
        const context = model.context;
        const isCopy = kind === "copy";
        let newId = resId;
        return this._queueChange({
            send: async () => {
                if (isCopy) {
                    const copied = await orm.call(model.resModel, "copy", [[resId]], {
                        default: values,
                        context,
                    });
                    newId = Array.isArray(copied) ? copied[0] : copied;
                } else {
                    await orm.write(model.resModel, [resId], values, { context });
                }
                return true;
            },
            // only to draw the pill again from its stored values
            reloadOnRefusal: !isCopy,
            announce: () =>
                this._notifyChange({
                    message: isCopy ? _t("Record copied") : _t("Dates changed"),
                    undo: { kind, resId: newId, values: isCopy ? {} : undo?.values || {} },
                }),
        });
    }

    /**
     * R10: take a change back on the server and tell the user. `undo` is the descriptor of the
     * notification: `{kind: "move"|"resize"|"copy", resId, values}`, `resId` being the copy for
     * a copy. The view reloads whatever the answer. Resolves `true` when it was undone. When the
     * call itself fails, the notification of the change is closed and the error is passed on.
     * @returns {Promise<boolean>}
     */
    undoChange(undo) {
        const { model, services } = this;
        const { kind, resId, values, source } = undo;
        const isCopy = kind === "copy";
        return this._queueChange({
            send: () =>
                services.orm.call(model.resModel, "gantt_undo_drag_drop", [[resId]], {
                    drag_kind: isCopy ? "copy" : "reschedule",
                    values: isCopy ? {} : values,
                    context: model.context,
                }),
            reloadOnRefusal: true,
            refused: () => this._closeIfCurrent(source),
            announce: (done) =>
                this._notifyChange({
                    message: done
                        ? isCopy
                            ? _t("Copy removed")
                            : _t("Change undone")
                        : isCopy
                        ? _t("This copy could not be removed")
                        : _t("This change could not be undone"),
                    failed: !done,
                }),
        }).then(Boolean);
    }

    /**
     * The one pattern of a write of this view (R15): `send` after the writes queued before, then
     * reload and `announce(result)`; when `send` rejects, `refused` runs, the view reloads when
     * `reloadOnRefusal` (errors of that reload ignored) and the rejection is passed on. Nothing
     * is reloaded or announced once the view is left.
     */
    _queueChange({ send, reloadOnRefusal, refused, announce }) {
        const { model } = this;
        const reload = () => (model.disposed ? undefined : model.reload());
        return model.queueWrite(async () => {
            let result;
            try {
                result = await send();
            } catch (error) {
                refused?.();
                if (reloadOnRefusal) {
                    await reload()?.catch(() => {});
                }
                throw error;
            }
            try {
                await reload();
            } finally {
                announce(result);
            }
            return result;
        });
    }

    /** Close the notification of the last change, if it is still shown. */
    closeNotification() {
        this._current?.close();
        this._current = null;
    }

    _closeIfCurrent(source) {
        if (this._current && this._current === source) {
            this.closeNotification();
        }
    }

    /**
     * R10: one notification of this view at a time; it replaces the view's current one (the
     * newest change's, which is the clicked one unless a newer change was made while its Undo was
     * pending). Without an `undo` it is a result (no Undo button); `failed` makes it a danger
     * one. Nothing is shown once the view is left.
     */
    _notifyChange({ message, undo, failed = false }) {
        this.closeNotification();
        if (this.model.disposed) {
            return;
        }
        const type = failed ? "danger" : "success";
        const options = { type, className: `o_tl_notification o_tl_notification_${type}` };
        const handle = {};
        if (undo) {
            let used = false;
            options.buttons = [
                {
                    name: _t("Undo"),
                    icon: "undo",
                    onClick: () => {
                        // a second click while the undo runs does nothing; the notification stays
                        // (with its progress bar) until the server answers (R10)
                        if (!used) {
                            used = true;
                            this.undoChange({ ...undo, source: handle });
                        }
                    },
                },
            ];
        }
        handle.close = this.services.notification.add(message, options);
        this._current = handle;
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
            try {
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
            } catch (error) {
                // a dialog that fails to open must not block the next ones
                this._recordOpen = false;
                reject(error);
            }
        });
    }
}
