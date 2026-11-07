# Pilot: slice 000-timer

The pilot ran one small slice end to end. It had three aims:
- check the clean-room process in [process.md](process.md);
- measure throughput;
- calibrate the overlap thresholds.

The slice is the timer component: `timer` and its test module `test_timer`. It depends only on `web` and `mail`. Both modules use their original names for compatibility, as [module-authoring.md](module-authoring.md#naming) allows. The pilot ran on 2026-11-07, and the owner approved the release on 2026-11-08.

## Result

- **Code:** `addons/timer/` and `addons/test_timer/`; user guide [modules/timer.md](modules/timer.md); provenance records `provenance/timer.yaml` and `provenance/test_timer.yaml`.
- **Spec package** (private):
  - 22 rules, 17 edge cases and 54 acceptance scenarios: 37 backend, 12 ui and 5 visual;
  - eight owner decisions, which correct or settle behaviour the original left open or got wrong.
- **Verification:** two rounds.
  - **Round 1** asked for rework on two points:
    - two visual scenarios failed, because the spec contradicted itself about the toggle colours;
    - the `timer` module's overlap ratio was 0.0886.
  - **Round 2** passed everything: 64 Odoo tests and 27 browser tests.
- **Overlap in the final round:** `timer` 0.0355, that is 21 of 592 lines, every one a name the spec requires; `test_timer` 0.0080. The longest run was 2 lines.

## Throughput

| Step | Agent working time |
|---|---|
| Analysis and spec check | 27 min, plus 5 min to apply the owner's decisions |
| Implementation, documentation and reviews | 1 h 23 min |
| Verification, round 1 | 13 min |
| Rework | 28 min |
| Verification, round 2 | 8 min |

The total is about 2 h 45 min of agent time. The calendar time was longer: every checkpoint waited for the owner, and the pilot stopped to fix the infrastructure problems listed below.

## Cost

| Role | Approximate cost |
|---|---|
| Analyst side, including follow-ups | $6.7 |
| Implementation: orchestrator, implementers and reviewers | $32.0 |
| Verifier, two rounds | $6.4 |
| Infrastructure fixes the pilot made necessary | $15.0 |

The slice alone cost about $45; with the infrastructure fixes, about $60.

## Threshold calibration

- **Keep both thresholds:** a ratio of at most 5 %, and no run of 5 or more lines. The longest run never came near the limit.
- **Why round 1 failed.** Nothing was copied. 18 lines used conventional names derived from required names, and 10 lines used common framework idioms. After the implementer renamed and rewrote those lines, only required names matched.
- **New authoring rule:** use your own names for every identifier the spec does not require ([module-authoring.md](module-authoring.md#naming)).
- **Recommended tool:** an overlap report for the implementer side. It would list the matching Complete lines without showing the reference, so the implementer can fix them in the same round.

## Infrastructure fixed during the pilot

- **Commits in the sandbox:** sandboxed sessions could not commit, because a permission rule made all of `.git/` read-only. The rule now covers only `.git/hooks` and `.git/config` ([isolation.md](isolation.md)).
- **Offline hooks:** the commit hooks downloaded a tool on every run. They are local hooks now, so they work offline.
- **Container rules:** the guard checked mounts but not images or containers. Implementer sessions may now use only the project's images and its compose containers.
- **Browser tests:** the Odoo image lacked a browser, so they were silently skipped. Headless Chrome is now part of the image.
- **Provenance during development:** the local provenance check now lets work be committed before the record exists. CI stays strict.
- **Spec tooling:** in the private repository, the spec lint accepts the verifier's outputs, and a tool computes the package hash that provenance records quote.

## Backlog before the next slice

- **Capture harness:** a login that takes the database, and a step that prepares data between captures.
- **Overlap:** the implementer-side overlap report described above.
- **Spec lint:** reject capture-scenario files under the verifier's output folder.
- **Module README:** Odoo renders `README.md` as reStructuredText and warns during install. Give the scaffold a manifest `description` or an `.rst` README.
- **Pre-commit:** check only staged files, so that one agent's drafts cannot block another agent's commit.
- **Process order:** integration comes before provenance in the lifecycle table, but CI requires the record. Swap steps 8 and 9.
- **Chrome in the image:** pin and verify the download.
- **Small test gaps** the verifier noted, and a host form for the timer toggle in `test_timer`.
