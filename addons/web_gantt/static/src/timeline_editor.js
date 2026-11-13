// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { Domain } from "@web/core/domain";
import { _t } from "@web/core/l10n/translation";
import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";
import { SelectCreateDialog } from "@web/views/view_dialogs/select_create_dialog";
import { creationContext, planWriteValues, rowValueChain } from "./timeline_editing";

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
            await model.trackWrite(orm.write(model.resModel, ids, values, { context }));
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
}
