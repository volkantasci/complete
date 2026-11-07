// Copyright 2026 Complete contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Index of the tile to focus after a navigation key.
 *
 * @param {"ArrowRight"|"ArrowLeft"|"ArrowDown"|"ArrowUp"|"Tab"|"Shift+Tab"} key
 * @param {number|null} index focused tile, null when none is focused
 * @param {number} count number of tiles
 * @param {number} rowLength tiles per row currently shown
 * @returns {number|null} null when there is no tile
 */
export function nextTileIndex(key, index, count, rowLength) {
    if (count <= 0) {
        return null;
    }
    if (index === null || index === undefined) {
        return 0;
    }
    const last = count - 1;
    const row = Math.ceil((index + 1) / rowLength);
    const rows = Math.ceil(count / rowLength);
    let target;
    switch (key) {
        case "ArrowRight":
            target =
                index === last || (index + 1) % rowLength === 0
                    ? (row - 1) * rowLength
                    : index + 1;
            break;
        case "ArrowLeft":
            target =
                index % rowLength !== 0
                    ? index - 1
                    : index + Math.min(last - index, rowLength - 1);
            break;
        case "ArrowDown":
            target =
                row === rows ? index % rowLength : index + Math.min(rowLength, last - index);
            break;
        case "ArrowUp":
            target =
                row === 1 ? Math.min(index + (rows - 1) * rowLength, last) : index - rowLength;
            break;
        case "Tab":
            target = index + 1;
            break;
        case "Shift+Tab":
            target = index - 1;
            break;
        default:
            return index;
    }
    if (target < 0) {
        return last;
    }
    if (target > last) {
        return 0;
    }
    return target;
}
