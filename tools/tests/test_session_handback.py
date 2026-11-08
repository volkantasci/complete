# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

import json

from tools.session_handback import handback_text, main, read_results

HEADER = "started S | exit code 0 | model opus | cwd /w"


def _stream(tmp_path, *events):
    path = tmp_path / "run.jsonl"
    path.write_text("".join(json.dumps(e) + "\n" for e in events) + "not json\n")
    return str(path)


def _init():
    return {"type": "system", "subtype": "init", "session_id": "abc"}


def _said(text="Working."):
    return {"type": "assistant", "message": {"content": [{"type": "text", "text": text}]}}


def _result(text, turns=1):
    return {
        "type": "result",
        "session_id": "abc",
        "num_turns": turns,
        "total_cost_usd": 1.5,
        "duration_ms": 10,
        "is_error": False,
        "result": text,
    }


def _text(path):
    return handback_text(read_results(path), "S", "0", "opus", "/w")


def test_final_message_only(tmp_path):
    path = _stream(tmp_path, _init(), _said(), _result("**Status:** DONE\n" + "x" * 2000, turns=7))
    assert _text(path) == (
        HEADER + "\n"
        "session abc | turns 7 | cost 1.5 | duration_ms 10 | is_error False\n"
        "\n"
        "**Status:** DONE\n" + "x" * 2000 + "\n"
    )


def test_short_final_message_adds_the_earlier_report(tmp_path):
    path = _stream(
        tmp_path,
        _init(),
        _said(),
        _result("Task 3 is running."),
        _result("**Status:** OVERLAP_CHECK. The full report."),
        _result("Nothing is in flight; the report is in my previous message."),
    )
    text = _text(path)
    assert text.endswith(
        "Nothing is in flight; the report is in my previous message.\n"
        "\n---\n\nEarlier report in this run:\n\n"
        "**Status:** OVERLAP_CHECK. The full report.\n"
    )
    assert "Task 3 is running." not in text


def test_replayed_result_is_not_this_runs_report(tmp_path):
    path = _stream(
        tmp_path,
        _init(),
        _result("**Status:** DONE. The previous run's report."),
        _init(),
        _said(),
        _result("Short final message."),
    )
    text = _text(path)
    assert "Short final message." in text
    assert "previous run" not in text


def test_replayed_result_is_used_when_the_run_has_none(tmp_path):
    path = _stream(tmp_path, _result("**Status:** DONE. Replayed."), _init())
    assert "Replayed." in _text(path)


def test_no_result_event(tmp_path):
    path = _stream(tmp_path, _init())
    assert _text(path) == HEADER + "\nno result event: the session ended without a final message\n"


def test_main_writes_the_file_and_checks_arguments(tmp_path):
    path = _stream(tmp_path, _init(), _said(), _result("**Status:** DONE " + "y" * 1600))
    out = tmp_path / "handback.md"
    assert main([path, str(out), "S", "0", "opus", "/w"]) == 0
    assert out.read_text().startswith(HEADER + "\nsession abc")
    assert main([path]) == 2
