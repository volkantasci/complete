// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only
import { cookie } from "@web/core/browser/cookie";
import { darkenColor, lightenColor } from "@web/core/colors/colors";
import { sortBy } from "@web/core/utils/arrays";
import { patch } from "@web/core/utils/patch";
import { GraphRenderer } from "@web/views/graph/graph_renderer";

// Fixed end colours of the line area gradient (001b R28); the same values are the
// graph-area-end role of the two role files.
const AREA_END = { light: "#FFFFFF", dark: "#262A36" };

function isDark(scheme) {
    return scheme === "dark";
}

/**
 * Fill of the area under a line: from a lighter variant of the line colour
 * (darker in the dark scheme) at the top of the chart area to a fixed end
 * colour at the bottom. Before the chart has a size the plain base colour is
 * returned.
 * @param {Object} chart Chart.js instance
 * @param {string} baseColour #rrggbb
 * @param {string} scheme "light" or "dark"
 * @returns {CanvasGradient|string}
 */
export function lineAreaFill(chart, baseColour, scheme) {
    const area = chart?.chartArea;
    if (!area || !chart.ctx) {
        return baseColour;
    }
    const top = isDark(scheme) ? darkenColor(baseColour, 0.5) : lightenColor(baseColour, 0.5);
    const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, isDark(scheme) ? AREA_END.dark : AREA_END.light);
    return gradient;
}

function sliceEdgeColour(baseColour, scheme) {
    return isDark(scheme) ? darkenColor(baseColour, 0.1) : lightenColor(baseColour, 0.1);
}

/**
 * Fill of a pie slice: radial gradient from the base colour at the inner
 * radius to a 10 % lighter (darker in dark) variant at the outer radius.
 * Before the chart has a size the plain base colour is returned.
 * @param {Object} chart Chart.js instance
 * @param {string} baseColour #rrggbb
 * @param {string} scheme "light" or "dark"
 * @returns {CanvasGradient|string}
 */
export function pieSliceFill(chart, baseColour, scheme) {
    const area = chart?.chartArea;
    if (!area || !chart.ctx) {
        return baseColour;
    }
    const arc = chart.getDatasetMeta?.(0)?.data?.[0];
    const x = arc?.x ?? (area.left + area.right) / 2;
    const y = arc?.y ?? (area.top + area.bottom) / 2;
    const outer =
        arc?.outerRadius || Math.min(area.right - area.left, area.bottom - area.top) / 2;
    const inner = arc?.innerRadius || 0;
    const gradient = chart.ctx.createRadialGradient(x, y, inner, x, y, outer);
    gradient.addColorStop(0, baseColour);
    gradient.addColorStop(1, sliceEdgeColour(baseColour, scheme));
    return gradient;
}

const scheme = () => cookie.get("color_scheme") || "light";

const cwsGraphRendererPatch = {
    getElementOptions() {
        const options = super.getElementOptions(...arguments);
        if (options.bar) {
            options.bar = { ...options.bar, borderWidth: 0 };
        }
        if (options.line) {
            options.line = { ...options.line, fill: true };
        }
        return options;
    },

    getBarChartData() {
        const data = super.getBarChartData(...arguments);
        for (const dataset of this.model.data.datasets) {
            dataset.borderWidth = 0;
        }
        return data;
    },

    getLineChartData() {
        const data = super.getLineChartData(...arguments);
        for (const dataset of data.datasets) {
            const base = dataset.borderColor;
            dataset.backgroundColor = (context) => lineAreaFill(context.chart, base, scheme());
        }
        return data;
    },

    getPieChartData() {
        const data = super.getPieChartData(...arguments);
        for (const dataset of data.datasets) {
            const bases = [...dataset.backgroundColor];
            dataset.cwsBaseColours = bases;
            const fill = (context) =>
                pieSliceFill(context.chart, bases[context.dataIndex], scheme());
            dataset.backgroundColor = fill;
            dataset.hoverBackgroundColor = fill;
            dataset.borderWidth = 0;
            dataset.hoverBorderWidth = 0;
        }
        return data;
    },

    getLegendOptions() {
        const options = super.getLegendOptions(...arguments);
        options.labels = {
            ...options.labels,
            boxWidth: 30,
            useBorderRadius: true,
            borderRadius: 4,
        };
        return options;
    },

    getTooltipItems(data, metaData, tooltipModel) {
        const items = super.getTooltipItems(...arguments);
        if (metaData.mode !== "pie") {
            return items;
        }
        // same order as in CE: data points sorted by value, largest first
        const points = sortBy(tooltipModel.dataPoints, "raw", "desc");
        const current = scheme();
        items.forEach((item, position) => {
            const point = points[position];
            const base = data.datasets[point.datasetIndex]?.cwsBaseColours?.[point.dataIndex];
            if (base) {
                item.boxColor = `radial-gradient(circle, ${base}, ${sliceEdgeColour(base, current)})`;
            }
        });
        return items;
    },
};

patch(GraphRenderer.prototype, cwsGraphRendererPatch);
