// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { _t } from "@web/core/l10n/translation";
import { TimelineEditor } from "@web_gantt/timeline_editor";

/**
 * The editor of the time-off views: the framework's, plus the split of a request and the Undo of
 * the split (R17). Both use the editor's own write queue, notification box and `Undo` button
 * (002b2's `o_tl_notification`), so one notification of the view shows at a time.
 */
export class TimeOffEditor extends TimelineEditor {
    /**
     * R17 points 1 to 3, 5: divide the request `resId` at `day` ("YYYY-MM-DD", the second part's
     * first day) through the server, reload the view, then show the notification with Undo; no
     * notification when the server created no request. A refused call reloads nothing (the pill
     * stays as drawn, D9) and the rejection is passed on, so that the Community's error shows.
     * @returns {Promise<boolean>} whether a request was created
     */
    hhgSplit({ resId, day }) {
        const { model, services } = this;
        return this._queueChange({
            send: () =>
                services.orm.call(model.resModel, "hhg_cut_request", [[resId]], {
                    split_day: day,
                    context: model.context,
                }),
            reloadOnRefusal: false,
            announce: (answer) => {
                if (!answer?.new_ids?.length) {
                    return;
                }
                this._notifyChange({
                    message: _t("Time off split in two."),
                    plain: true,
                    undo: {
                        kind: "split",
                        resId,
                        newIds: answer.new_ids,
                        endDay: answer.end_day,
                        endPeriod: answer.end_period,
                        endHour: answer.end_hour,
                    },
                });
            },
        }).then((answer) => Boolean(answer?.new_ids?.length));
    }

    /** R17 point 4: Undo of a split joins the parts again; `false` from the server is a danger notice. */
    undoChange(undo) {
        if (undo.kind !== "split") {
            return super.undoChange(undo);
        }
        const { model, services } = this;
        return this._queueChange({
            send: () =>
                services.orm.call(model.resModel, "hhg_rejoin_request", [[undo.resId]], {
                    new_ids: undo.newIds,
                    end_day: undo.endDay,
                    end_period: undo.endPeriod,
                    end_hour: undo.endHour,
                    context: model.context,
                }),
            reloadOnRefusal: true,
            immediate: true,
            refused: () => this._closeIfCurrent(undo.source),
            announce: (done) =>
                this._notifyChange({
                    message: done
                        ? _t("The two parts are one request again.")
                        : _t("This split could not be undone."),
                    failed: !done,
                    plain: true,
                }),
        }).then(Boolean);
    }
}
