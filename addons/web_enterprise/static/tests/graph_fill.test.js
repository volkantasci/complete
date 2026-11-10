// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { after, describe, expect, test } from "@odoo/hoot";

import { lineAreaFill, pieSliceFill } from "@web_enterprise/views/graph_fill_patch";

describe.current.tags("headless");

/** A chart stand-in whose canvas context records the gradients it creates. */
function makeChart(chartArea, arc) {
    const gradients = [];
    const record = (kind) =>
        (...args) => {
            const gradient = {
                kind,
                args,
                stops: [],
                addColorStop(offset, colour) {
                    this.stops.push([offset, colour.toLowerCase()]);
                },
            };
            gradients.push(gradient);
            return gradient;
        };
    return {
        gradients,
        chartArea,
        ctx: {
            createLinearGradient: record("linear"),
            createRadialGradient: record("radial"),
        },
        getDatasetMeta: () => ({ data: arc ? [arc] : [] }),
    };
}

const AREA = { top: 10, bottom: 110, left: 20, right: 220 };

/** The page defines the end colour role (the role files do it in the real bundles). */
function setAreaEnd(colour) {
    const style = document.documentElement.style;
    style.setProperty("--o-cws-graph-area-end", colour);
    after(() => style.removeProperty("--o-cws-graph-area-end"));
}

test("A73 line area fades to the scheme end colour", () => {
    setAreaEnd("#FFFFFF");
    const light = makeChart(AREA);
    const gradient = lineAreaFill(light, "#336699", "light");
    expect(gradient.kind).toBe("linear");
    // vertical, over the chart area
    expect(gradient.args).toEqual([0, 10, 0, 110]);
    // 50 % toward white at the top, white at the bottom
    expect(gradient.stops).toEqual([
        [0, "#99b3cc"],
        [1, "#ffffff"],
    ]);

    // the dark bundle sets another value for the same role
    setAreaEnd("#262A36");
    const dark = makeChart(AREA);
    expect(lineAreaFill(dark, "#336699", "dark").stops).toEqual([
        [0, "#1a334d"],
        [1, "#262a36"],
    ]);
});

test("A73b line area without the end colour role is the plain base colour", () => {
    // `initial` makes the property undefined, whatever the stylesheets say
    setAreaEnd("initial");
    const chart = makeChart(AREA);
    expect(lineAreaFill(chart, "#336699", "light")).toBe("#336699");
    expect(chart.gradients).toHaveLength(0);
});

test("A74 pie slices use a radial gradient", () => {
    const arc = { x: 100, y: 80, innerRadius: 0, outerRadius: 60 };
    const light = makeChart(AREA, arc);
    const gradient = pieSliceFill(light, "#336699", "light");
    expect(gradient.kind).toBe("radial");
    // from the inner radius to the outer radius
    expect(gradient.args).toEqual([100, 80, 0, 100, 80, 60]);
    // base colour inside, 10 % lighter at the outer radius
    expect(gradient.stops).toEqual([
        [0, "#336699"],
        [1, "#4775a3"],
    ]);

    const dark = makeChart(AREA, arc);
    // darker in dark
    expect(pieSliceFill(dark, "#336699", "dark").stops).toEqual([
        [0, "#336699"],
        [1, "#2e5c8a"],
    ]);
});

test("A76 first paint without chart area uses the base colour", () => {
    setAreaEnd("#FFFFFF");
    const early = makeChart(undefined);
    expect(lineAreaFill(early, "#336699", "light")).toBe("#336699");
    expect(pieSliceFill(early, "#336699", "dark")).toBe("#336699");
    expect(early.gradients).toHaveLength(0);
    // no chart at all
    expect(lineAreaFill(undefined, "#336699", "light")).toBe("#336699");
    expect(pieSliceFill(null, "#336699", "light")).toBe("#336699");
});

test("A76b gradient follows a resized chart area", () => {
    setAreaEnd("#FFFFFF");
    const chart = makeChart({ top: 0, bottom: 100, left: 0, right: 100 });
    expect(lineAreaFill(chart, "#336699", "light").args).toEqual([0, 0, 0, 100]);
    expect(pieSliceFill(chart, "#336699", "light").args).toEqual([50, 50, 0, 50, 50, 50]);
    // the chart is resized after its first paint
    chart.chartArea = { top: 5, bottom: 305, left: 0, right: 200 };
    expect(lineAreaFill(chart, "#336699", "light").args).toEqual([0, 5, 0, 305]);
    expect(pieSliceFill(chart, "#336699", "light").args).toEqual([100, 155, 0, 100, 155, 100]);
});
