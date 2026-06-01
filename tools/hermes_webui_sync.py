#!/usr/bin/env python3
"""Small stdlib-only relay from Hermes gateway code to Hermes WebUI."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone


DEFAULT_WEBUI_URL = "http://127.0.0.1:4173"
DEFAULT_INBOX_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "hermes-webui-inbox.ndjson")
)


def post_webui_message(
    agent: str,
    text: str,
    *,
    kind: str = "telegram",
    server: str | None = None,
    inbox: str | None = None,
    tone: str | None = None,
    cron_type: str | None = None,
    job_id: str | None = None,
    title: str | None = None,
    task_status: str | None = None,
    timeout: float = 1.2,
    strict: bool = False,
) -> bool:
    """Post an agent message to the running Hermes WebUI.

    This function is intentionally dependency-free so WSL Hermes gateway code can
    import it without changing the gateway environment.
    """

    text = (text or "").strip()
    if not text:
        return False

    base_url = (server or os.environ.get("HERMES_WEBUI_URL") or DEFAULT_WEBUI_URL).rstrip("/")
    endpoint = "/api/cron" if kind == "cron" else "/api/telegram"
    payload = {
        "agent": agent,
        "text": text,
        "source": kind,
        "kind": "cron" if kind == "cron" else "message",
        "tone": tone or ("cron" if kind == "cron" else "telegram"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if kind == "cron":
        payload["cronType"] = cron_type or "reminder"
        if job_id:
            payload["jobId"] = job_id
        if title:
            payload["title"] = title
        if task_status:
            payload["taskStatus"] = task_status
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}{endpoint}",
        data=data,
        headers={"content-type": "application/json; charset=utf-8"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return 200 <= response.status < 300
    except (OSError, urllib.error.URLError, urllib.error.HTTPError):
        inbox_path = inbox or os.environ.get("HERMES_WEBUI_INBOX") or DEFAULT_INBOX_PATH
        if write_webui_inbox(payload, inbox_path):
            return True
        if strict:
            raise
        return False


def write_webui_inbox(payload: dict, inbox_path: str) -> bool:
    try:
        os.makedirs(os.path.dirname(os.path.abspath(inbox_path)), exist_ok=True)
        with open(inbox_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
        return True
    except OSError:
        return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Relay Hermes text to Hermes WebUI.")
    parser.add_argument("--agent", required=True, help="Agent name, id, or alias, e.g. HermesFox.")
    parser.add_argument("--text", help="Message text. If omitted, stdin is used.")
    parser.add_argument("--kind", choices=["telegram", "cron"], default="telegram")
    parser.add_argument("--server", default=os.environ.get("HERMES_WEBUI_URL", DEFAULT_WEBUI_URL))
    parser.add_argument("--inbox", default=os.environ.get("HERMES_WEBUI_INBOX", DEFAULT_INBOX_PATH))
    parser.add_argument("--tone")
    parser.add_argument("--cron-type", choices=["reminder", "task"], default=None)
    parser.add_argument("--job-id")
    parser.add_argument("--title")
    parser.add_argument("--task-status")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args(argv)

    text = args.text if args.text is not None else sys.stdin.read()
    ok = post_webui_message(
        args.agent,
        text,
        kind=args.kind,
        server=args.server,
        inbox=args.inbox,
        tone=args.tone,
        cron_type=args.cron_type,
        job_id=args.job_id,
        title=args.title,
        task_status=args.task_status,
        strict=args.strict,
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
