#!/usr/bin/env bash
# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
#
# Run one headless Claude Code session for a slice and copy its final message
# to a handback file. The owner runs this from a shell; see docs/slice-runbook.md.
#
# Usage: tools/run_session.sh WORKDIR HANDOFF STREAM HANDBACK MODEL [extra claude args...]
#
# - The session starts in WORKDIR with auto memory off, so it sees only the
#   handoff and the documents the handoff names.
# - Permission mode is auto.
# - Background subagents may run as long as they need. Print mode would
#   otherwise stop them 10 minutes after the session's last turn.
# - The stream-json transcript goes to STREAM. For analyst and verifier
#   sessions, keep STREAM in the specification repository's analyst area.
# - When the session ends, HANDBACK gets one header line with the run's
#   numbers, then the session's final message, and nothing else from the
#   transcript.
# - Extra arguments go to claude, for example `--resume <id>` or `--add-dir <dir>`.
#   A resumed stream starts with a replayed result event, so wait for HANDBACK
#   rather than for the first result event.
set -u
if [ $# -lt 5 ]; then
  echo "usage: $0 WORKDIR HANDOFF STREAM HANDBACK MODEL [extra claude args...]" >&2
  exit 2
fi
workdir=$1 handoff=$2 stream=$3 handback=$4 model=$5
shift 5
mkdir -p "$(dirname "$stream")" "$(dirname "$handback")"
cd "$workdir" || exit 1
start=$(date -u +%FT%TZ)
CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 \
  claude -p "$(cat "$handoff")" --model "$model" \
  --permission-mode auto --output-format stream-json --verbose "$@" > "$stream" 2>&1
code=$?
python3 -I - "$stream" "$handback.tmp" "$start" "$code" "$model" "$workdir" <<'EOF'
import json
import sys

stream, out, start, code, model, workdir = sys.argv[1:7]
result = None
with open(stream, encoding="utf-8", errors="replace") as fh:
    for line in fh:
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict) and event.get("type") == "result":
            result = event
with open(out, "w", encoding="utf-8") as fh:
    fh.write(f"started {start} | exit code {code} | model {model} | cwd {workdir}\n")
    if result is None:
        fh.write("no result event: the session ended without a final message\n")
    else:
        fh.write(
            f"session {result.get('session_id')} | turns {result.get('num_turns')} | "
            f"cost {result.get('total_cost_usd')} | duration_ms {result.get('duration_ms')} | "
            f"is_error {result.get('is_error')}\n\n"
        )
        fh.write(str(result.get("result", "")) + "\n")
EOF
mv "$handback.tmp" "$handback"
