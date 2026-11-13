// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { browser } from "@web/core/browser/browser";

/** Edge scrolling of a selection and of a resize: zone width in px, speed in px per second (R14, R20). */
export const SELECT_EDGE = { zone: 150, speed: 2500 };
/** Edge scrolling of a pill move (R14). */
export const MOVE_EDGE = { zone: 30, speed: 625 };

/** Duration assumed for the first frame of a scroll, in milliseconds. */
const FIRST_FRAME = 1000 / 60;

/**
 * Speed in px per second at `distance` px from an edge: `speed × (1 − distance / zone)`, the full
 * speed on and beyond the edge, none from the width of the zone on (R14).
 */
export function edgeVelocity(distance, { zone, speed }) {
    if (!(zone > 0)) {
        return 0;
    }
    const d = Math.max(0, distance);
    return d >= zone ? 0 : speed * (1 - d / zone);
}

/**
 * Scrolls the grid while a pointer is held near an edge of its area, by speed and time, on every
 * animation frame (R14, R20), and also on the vertical axis when `axes` is "xy".
 *
 * The host gives:
 * - `edges()`: `{left, right, top, bottom}`, the viewport bounds of the scrolling area (the row
 *   header column is not part of it); `top` and `bottom` are only read for "xy";
 * - `scrollBy(dx, dy)`: scroll the grid (positive: its content moves left, up) and return the
 *   `{dx, dy}` that was really scrolled (less at the ends of the grid);
 * - `onScrolled()`: the grid has scrolled, the pointer's target is to be worked out again;
 * - `axes`: "x" (default) or "xy".
 */
export class TimelineEdgeScroll {
    constructor({ edges, scrollBy, onScrolled, axes = "x" }) {
        this.edges = edges;
        this.scrollBy = scrollBy;
        this.onScrolled = onScrolled;
        this.axes = axes;
        this._frame = null;
        this._inFrame = false;
        this._pointer = null;
        this._config = null;
        this._last = null;
        this._rest = { x: 0, y: 0 };
    }

    /** The pointer moved to the viewport point (x, y): starts the frame loop in a zone. */
    follow(x, y, config) {
        this._pointer = { x, y };
        this._config = config;
        if (this._frame === null && !this._inFrame && this._velocity().some(Boolean)) {
            this._frame = browser.requestAnimationFrame((time) => this._step(time));
        }
    }

    /** The gesture is over: no more scrolling. */
    stop() {
        if (this._frame !== null) {
            browser.cancelAnimationFrame(this._frame);
            this._frame = null;
        }
        this._pointer = null;
        this._config = null;
        this._last = null;
        this._rest = { x: 0, y: 0 };
    }

    /** `[vx, vy]` in px per second for the pointer where it is. */
    _velocity() {
        if (!this._pointer) {
            return [0, 0];
        }
        const box = this.edges();
        const { x, y } = this._pointer;
        return [
            this._axis(x, box.left, box.right),
            this.axes === "xy" ? this._axis(y, box.top, box.bottom) : 0,
        ];
    }

    _axis(point, low, high) {
        if (!Number.isFinite(low) || !Number.isFinite(high)) {
            return 0;
        }
        // never wider than half the area
        const zone = Math.min(this._config.zone, (high - low) / 2);
        if (zone <= 0) {
            return 0;
        }
        const config = { zone, speed: this._config.speed };
        if (point > high - zone) {
            return edgeVelocity(high - point, config);
        }
        if (point < low + zone) {
            return -edgeVelocity(point - low, config);
        }
        return 0;
    }

    _step(time) {
        this._frame = null;
        if (!this._pointer) {
            return;
        }
        const dt = this._last === null ? FIRST_FRAME : Math.max(0, time - this._last);
        this._last = time;
        const [vx, vy] = this._velocity();
        if (!vx && !vy) {
            this._idle();
            return;
        }
        const want = {
            x: this._rest.x + (vx * dt) / 1000,
            y: this._rest.y + (vy * dt) / 1000,
        };
        const whole = { x: Math.trunc(want.x), y: Math.trunc(want.y) };
        this._rest = { x: want.x - whole.x, y: want.y - whole.y };
        let done = { dx: 0, dy: 0 };
        if (whole.x || whole.y) {
            done = this.scrollBy(whole.x, whole.y) || done;
            if (!done.dx && !done.dy) {
                // the end of the grid: nothing more to wait for until the pointer moves again
                this._idle();
                return;
            }
            if (done.dx !== whole.x) {
                this._rest.x = 0;
            }
            if (done.dy !== whole.y) {
                this._rest.y = 0;
            }
            this._inFrame = true;
            try {
                this.onScrolled();
            } finally {
                this._inFrame = false;
            }
        }
        if (this._pointer && this._frame === null) {
            this._frame = browser.requestAnimationFrame((next) => this._step(next));
        }
    }

    /** No scrolling for now: forget the time of the last frame and the fractions. */
    _idle() {
        this._last = null;
        this._rest = { x: 0, y: 0 };
    }
}
