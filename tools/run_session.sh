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
#   transcript. If that message is short and an earlier message of the same
#   run carries a status line, the earlier report follows it
#   (tools/session_handback.py).
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
here=$(cd "$(dirname "$0")" && pwd)
cd "$workdir" || exit 1
start=$(date -u +%FT%TZ)
CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 \
  claude -p "$(cat "$handoff")" --model "$model" \
  --permission-mode auto --output-format stream-json --verbose "$@" > "$stream" 2>&1
code=$?
python3 -I "$here/session_handback.py" "$stream" "$handback.tmp" "$start" "$code" "$model" "$workdir"
mv "$handback.tmp" "$handback"
