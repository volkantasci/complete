// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";

const AUTOMATIC_METHODS = ["consumeBuffer", "maintainBuffer"];

/**
 * 002c R16, R21: the browser side of the automatic rescheduling methods. The editor hands a move
 * or a resize to this object when the view has dependencies and the effective method is automatic;
 * it makes the one call of the server method (through the editor's write queue), then shows the
 * answer as a sticky notification, with Undo unless the server refused.
 */
export class TimelineRescheduler {
    /** @param {import("./timeline_editor").TimelineEditor} editor */
    constructor(editor) {
        this.editor = editor;
    }

    /**
     * Whether a change of `kind` is rescheduled: the view names both dependency fields, the
     * method that applies (the model's, also on the phone where there is no menu) is automatic,
     * and the change is a move or a resize (copies write as before).
     */
    handles(kind) {
        const { model, archInfo } = this.editor;
        return (
            (kind === "move" || kind === "resize") &&
            Boolean(archInfo.dependencyField && archInfo.dependencyInvertedField) &&
            AUTOMATIC_METHODS.includes(model.rescheduleMethod)
        );
    }

    /**
     * The call (R16): `values` are those 002b2 would write, possibly none (E4). The answer is
     * shown after the view reloaded, also when the server refused (then the rejection goes on).
     * Resolves `false` for a warning (nothing moved), `true` otherwise.
     */
    async run({ resId, values }) {
        const { editor } = this;
        const { model, archInfo, services } = editor;
        const method = model.rescheduleMethod;
        const answer = await editor._queueChange({
            send: () =>
                services.orm.call(model.resModel, "web_gantt_reschedule", [
                    values || {},
                    method,
                    [resId],
                    archInfo.dependencyField,
                    archInfo.dependencyInvertedField,
                    archInfo.startField,
                    archInfo.stopField,
                ]),
            reloadOnRefusal: true,
            announce: (result) => this.show(result),
        });
        return answer?.type !== "warning";
    }

    /** R21: the sticky notification of an answer; it replaces this view's current one. */
    show(answer) {
        const { editor } = this;
        editor.closeNotification();
        if (editor.model.disposed || !answer) {
            return;
        }
        const type = ["success", "info", "warning"].includes(answer.type) ? answer.type : "success";
        const options = {
            type,
            sticky: true,
            className: `o_tl_notification o_tl_notification_${type}`,
        };
        const handle = {};
        if (type !== "warning") {
            const old = answer.old_vals_per_pill_id || {};
            let used = false;
            options.buttons = [
                {
                    name: _t("Undo"),
                    icon: "undo",
                    onClick: (ev) => {
                        // a second click while the rollback runs does nothing
                        if (!used) {
                            used = true;
                            editor._holdOpen(ev?.currentTarget?.closest(".o_notification"));
                            this.undo(old, handle);
                        }
                    },
                },
            ];
        }
        handle.close = editor.services.notification.add(answer.message || "", options);
        editor._current = handle;
    }

    /**
     * R21 point 3: write the old values back (the rollback method on the listed records), close
     * the notification and reload. A refused call closes it too and the error is passed on.
     */
    undo(old, handle) {
        const { editor } = this;
        const { model, services } = editor;
        return editor._queueChange({
            send: () =>
                services.orm.call(
                    model.resModel,
                    "action_rollback_scheduling",
                    [Object.keys(old).map(Number), old]
                ),
            reloadOnRefusal: true,
            immediate: true,
            refused: () => editor._closeIfCurrent(handle),
            announce: () => editor._closeIfCurrent(handle),
        });
    }
}
