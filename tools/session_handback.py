# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Write the handback file of one headless session run.

Usage: python3 -I tools/session_handback.py STREAM OUT START CODE MODEL WORKDIR

The handback holds one header line with the run's numbers, then the session's
final message. A session with background work can be woken after its report
and end on a short message that only points back to it. When the final message
is short and an earlier message of the same run carries a status line, that
earlier report follows under its own heading.
"""

from __future__ import annotations

import json
import sys

SHORT = 1500
MARKER = "Status:"


def read_results(stream_path: str) -> list[dict]:
    """Return the result events of this run, oldest first.

    A resumed stream can start with a result event replayed from the previous
    run, before this run's first assistant message. Such events are used only
    when the run has no result event of its own.
    """
    results: list[dict] = []
    replayed: list[dict] = []
    seen_assistant = False
    with open(stream_path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if not isinstance(event, dict):
                continue
            if event.get("type") == "assistant":
                seen_assistant = True
            elif event.get("type") == "result":
                (results if seen_assistant else replayed).append(event)
    return results or replayed


def handback_text(results: list[dict], start: str, code: str, model: str, workdir: str) -> str:
    lines = [f"started {start} | exit code {code} | model {model} | cwd {workdir}"]
    if not results:
        lines.append("no result event: the session ended without a final message")
        return "\n".join(lines) + "\n"
    final = results[-1]
    lines.append(
        f"session {final.get('session_id')} | turns {final.get('num_turns')} | "
        f"cost {final.get('total_cost_usd')} | duration_ms {final.get('duration_ms')} | "
        f"is_error {final.get('is_error')}"
    )
    text = str(final.get("result", ""))
    lines += ["", text]
    if len(text) < SHORT:
        earlier = [r for r in results[:-1] if MARKER in str(r.get("result", ""))]
        if earlier:
            report = str(earlier[-1].get("result", ""))
            lines += ["", "---", "", "Earlier report in this run:", "", report]
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    if len(argv) != 6:
        print("usage: session_handback.py STREAM OUT START CODE MODEL WORKDIR", file=sys.stderr)
        return 2
    stream, out, start, code, model, workdir = argv
    text = handback_text(read_results(stream), start, code, model, workdir)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
