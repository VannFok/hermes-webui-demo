#!/usr/bin/env python3
"""Install the Hermes cron -> WebUI hook into the local WSL Hermes scheduler."""

from __future__ import annotations

import os
from pathlib import Path


DEFAULT_SCHEDULER = Path("/home/raindy/.hermes/hermes-agent/cron/scheduler.py")
DEFAULT_HELPER_DIR = "/mnt/d/CODEX项目/hermes-webui-demo/hermes-webui-demo/tools"

HOOK = f'''
def _notify_webui_cron_result(job: dict, content: str, success: bool, error: str | None = None) -> None:
    """Best-effort mirror of Hermes cron output into Hermes WebUI."""
    try:
        helper_dir = os.environ.get("HERMES_WEBUI_SYNC_DIR", "{DEFAULT_HELPER_DIR}")
        if helper_dir and helper_dir not in sys.path:
            sys.path.insert(0, helper_dir)
        from hermes_webui_cron_hook import notify_webui_cron

        notify_webui_cron(
            job,
            content,
            success=success,
            error=error,
            hermes_home=_get_hermes_home(),
        )
    except Exception as exc:
        logger.debug("Hermes WebUI cron hook failed for job %s: %s", job.get("id"), exc)

'''


def main() -> int:
    scheduler = Path(os.environ.get("HERMES_SCHEDULER_PATH", str(DEFAULT_SCHEDULER))).expanduser()
    text = scheduler.read_text(encoding="utf-8")
    original = text

    if "def _notify_webui_cron_result(" not in text:
        anchor = "def _deliver_result(job: dict, content: str, adapters=None, loop=None) -> Optional[str]:\n"
        if anchor not in text:
            raise SystemExit("Could not find _deliver_result anchor in scheduler.py")
        text = text.replace(anchor, HOOK + anchor, 1)

    call = "                    _notify_webui_cron_result(job, deliver_content, success, error)\n"
    if call.strip() not in text:
        anchor = "                if should_deliver:\n                    try:\n"
        replacement = "                if should_deliver:\n" + call + "                    try:\n"
        if anchor not in text:
            raise SystemExit("Could not find should_deliver anchor in scheduler.py")
        text = text.replace(anchor, replacement, 1)

    if text == original:
        print(f"already installed: {scheduler}")
        return 0

    backup = scheduler.with_suffix(scheduler.suffix + ".webui-hook.bak")
    if not backup.exists():
        backup.write_text(original, encoding="utf-8")
    scheduler.write_text(text, encoding="utf-8")
    print(f"installed: {scheduler}")
    print(f"backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
