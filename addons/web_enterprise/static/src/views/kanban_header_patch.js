// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { onMounted, onWillUnmount, signal } from "@odoo/owl";
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

patch(KanbanHeader.prototype, {
    setup() {
        super.setup(...arguments);
        this.cwsScrolled = signal(false);
        let scroller = null;
        const onScroll = () => this.cwsScrolled.set(scroller.scrollTop > 0);
        onMounted(() => {
            scroller = getScrollParent(this.rootRef());
            if (scroller) {
                scroller.addEventListener("scroll", onScroll, { passive: true });
                onScroll();
            }
        });
        onWillUnmount(() => {
            scroller?.removeEventListener("scroll", onScroll);
            scroller = null;
            this.cwsScrolled.set(false);
        });
    },

    /** Stuck: the container is scrolled down and the column is not folded. */
    get cwsIsStuck() {
        return this.cwsScrolled() && !this.group.isFolded;
    },
});
