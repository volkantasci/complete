# Computed-Style Comparison Design (R111)

| | |
|---|---|
| **Date** | 2026-11-10 |
| **Status** | Draft. Approach approved 2026-11-10: extend the capture harness; a separate tooling session builds it |
| **Owner** | Volkan TASCI |
| **Scope** | A measurement step and comparison commands for the capture harness, and how the analyst and the verifier use them from slice 001c on |

## 1. Context

Slice 001b took four verification rounds, and three of the differences that kept it open came from values measured by hand:

- The package stated a list's background and shadow as measured on another list of the same kind.
- A drop zone's margins and its dark-scheme border were not measured until the verifier probed them.

The verifier measured with ad hoc probes, so each round could find something the previous one had not looked at. The runbook's rule [Name what was measured](../../slice-runbook.md#rules-slice-001b-added) makes every value name its screen, field and state. This design adds a machine measurement behind each value, run the same way on every system.

## 2. Goals

1. One measurement, driven by the existing capture scenarios, runs on any of three systems: the original, plain Community, and Complete.
2. Before CP-spec, every measured value in the package comes from a measurement of the original, carries a probe id, and is checked by a command.
3. The verifier's first round compares the original and Complete on every probe and reports every difference in one table.

Non-goals:

- **Image comparison.** The harness's compare command already does this.
- **Automatic fixes.**
- **A tool on the implementer side.** Implementers never run the original. The verifier's table reaches them through `review.md`.
- **A selector map shared across slices.** It comes later, once two slices share screens.

## 3. Design

The harness's own command names apply; this document calls the four functions *measure*, *diff*, *table* and *check*. Probe lists use the same file format as the capture scenarios.

### 3.1 Probe list

Each slice has one probe list in the analyst area, next to the capture scenarios. The list holds DOM selectors, so it is never shared. Each probe has these keys:

| Key | Content |
|---|---|
| `id` | `M1`, `M2`, …, unique in the slice |
| `where` | The place in words (screen, element, state), as the package names it |
| `scenario`, `at` | The capture scenario that reaches the state, and the step after which to measure |
| `selectors` | One per system: `original`, `community`, `complete`. The analyst fills `original`, and `community` where needed. The verifier adds `complete` in round 1 |
| `index` | Optional. Which match to take when a selector matches several elements on purpose |
| `pseudo` | Optional. `::before` or `::after` |
| `properties` | The computed properties the package states, by name or by a small preset (`colors`, `box`, `text`) |
| `schemes`, `viewports` | Default `[light, dark]` and `[desktop, phone]` (1600×900 and 390×844) |
| `tolerance`, `ignore` | Optional per-probe overrides, for example for a height that depends on the data |

A selector must match exactly one element unless `index` is given. Otherwise the probe fails as `ambiguous` or `missing`. This rule is the core of the design: in 001b the wrong list was measured because nothing forced a measurement to say which element it took.

### 3.2 Measure

*Measure* runs a probe list on one system. It takes the base URL and the database, and logs in as the scenarios already do.

- **Order.** Probes are grouped by scenario and step, so each scenario runs once per scheme and viewport.
- **What it reads.** At the step it reads `getComputedStyle` and `getBoundingClientRect`. Geometry (x, y, width and height) is always measured.
- **Settling.** Measurement waits until transitions and animations have settled.
- **States.** Hover, keyboard focus and similar states come from scenario steps. Keyboard focus uses keyboard steps, because `:focus-visible` differs from focus set by a script.

The output is one JSON file. Its metadata names the system, the base URL (without credentials), the database, the original's build or Complete's commit, the browser version, the scheme, the viewport and the time. It holds the normalised values per probe:

- colours as `rgba(r, g, b, a)`;
- lengths in px, as numbers;
- shadows as a list of layers, each with its offsets, blur, spread and colour;
- font families as a list;
- keywords as they are.

Measurements and reports stay in the analyst area.

### 3.3 Diff

*Diff* compares two measurements by probe, scheme and viewport. It writes a Markdown report and a JSON file with these columns:

- probe id and `where`;
- property;
- value in each measurement, and the difference;
- verdict: `equal`, `within tolerance`, `differs`, `missing` or `not reached`.

The report starts with the counts. The exit code is 1 when anything differs or is missing.

Default tolerances:

| Value | Tolerance |
|---|---|
| Geometry | ±1 px |
| Other lengths | ±0.5 px |
| Colour channels | ±1 |
| Alpha | ±0.01 |
| Everything else | Exact, after normalisation |

*Diff* refuses two measurements taken with different browser versions.

### 3.4 Table and check

*Table* turns a measurement of the original into a Markdown table of probe id, `where`, scheme, viewport, property and value, between two marker comments.

- **Use.** The analyst pastes the table into the "Measured values" section of `spec.md`. The spec text refers to values by probe id.
- **Check.** *Check* fails when the table in `spec.md` no longer equals the table generated from the measurement it names.
- **Clean room.** The table holds no selectors, so `spec_lint`'s rules for the package still hold.

## 4. Use in the lifecycle

- **Analyst, before the spec review:**
  1. Writes a probe for every value the package states.
  2. Measures the original, and plain Community where the package says what the original changes.
  3. Pastes the table and writes the spec text against probe ids.
  4. Runs *check*.

  The package hash is computed after that. The analyst names the measurement file in its final message.
- **Verifier, round 1:**
  1. Adds the `complete` selectors.
  2. Measures the original and Complete on the same demo data.
  3. Runs *diff* and puts the table into `review.md`, with values only and no selectors.

  Every `differs` row is classed with the stop rule. Later rounds rerun the whole diff, which costs only machine time.
- **Implementers** see only the values table in the package and the diff table in `review.md`.

## 5. Build

- **The session.** One tooling session in the specification repository, started by the owner like the other sessions. It runs on sonnet, with the final review on opus.
- **Scope of the session:**
  - extends the capture harness;
  - documents the commands in that repository's README;
  - adds the "Measured values" section to the spec template, with `spec_lint` accepting it;
  - adds one step each to the analyst and verifier templates, worded from section 4.
- **Tests.** They run on a static HTML page served locally, without Odoo, and cover:
  - the exactly-one-match rule;
  - normalisation of colours and shadows;
  - tolerances and verdicts;
  - `missing` and `not reached`;
  - the table-and-check round trip;
  - exit codes.
- **Live run.** One live run on the 001b demo databases. It must show that the two field lists 001b confused measure differently, and that each list measures the same on the original and on Complete, within tolerance.
- **Report.** The session's final message gives the commands and their options in plain words, the test counts and the live run's counts. It contains no reference values.

## 6. Limits

- Computed styles do not show how text renders, or how images, canvas or SVG content look. The side-by-side images still cover that.
- Geometry of elements that depend on the data compares only when both databases hold the same records. Until a shared demo-data script exists, such probes ignore the affected values.
- Shadow DOM and iframes stay out of scope until a slice needs them.

## 7. Success criteria

From slice 001c on:

- *check* passes on the package at CP-spec;
- the verifier's first round reports the full diff table;
- no rework round is caused by a value measured on the wrong element or in the wrong state.
