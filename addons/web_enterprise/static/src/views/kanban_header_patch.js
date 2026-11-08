// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onMounted, onPatched, onWillUnmount } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { KanbanHeader } from "@web/views/kanban/kanban_header";

function getScrollParent(el) {
    for (let node = el.parentElement; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
            return node;
        }
    }
    return null;
}

// The look is set on the header element itself, not through the header template: views such
// as the CRM pipeline use a header whose template is a private copy of the Community one,
// which never receives a class added by an extension of that template.
patch(KanbanHeader.prototype, {
    setup() {
        super.setup(...arguments);
        let scroller = null;
        const refresh = () => {
            const stuck = Boolean(scroller && scroller.scrollTop > 0 && !this.group.isFolded);
            this.rootRef()?.classList.toggle("o_cws_stuck", stuck);
        };
        onMounted(() => {
            scroller = getScrollParent(this.rootRef());
            scroller?.addEventListener("scroll", refresh, { passive: true });
            refresh();
        });
        // a re-render rewrites the class attribute of the header
        onPatched(refresh);
        onWillUnmount(() => {
            scroller?.removeEventListener("scroll", refresh);
            scroller = null;
            this.rootRef()?.classList.remove("o_cws_stuck");
        });
    },
});
