"""Best-effort Hermes cron -> Hermes WebUI bridge."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from hermes_webui_sync import post_webui_message

logger = logging.getLogger(__name__)


PROFILE_AGENT_NAMES = {
    "default": "HermesFox",
    "hermesfox": "HermesFox",
    "hermies": "Hermies",
    "bf": "BF",
    "deercare": "deercare",
}

REMINDER_MARKERS = (
    "reminder",
    "weather",
    "提醒",
    "喝水",
    "喝茶",
    "下午茶",
    "下班",
    "写日记",
    "晚上好",
    "问候",
    "天气预报",
    "早餐",
    "折纸",
)


def notify_webui_cron(
    job: dict,
    content: str,
    *,
    success: bool = True,
    error: str | None = None,
    hermes_home: str | Path | None = None,
) -> bool:
    text = str(content or "").strip()
    if not text:
        return False

    cron_type = resolve_cron_type(job)
    task_status = "completed" if success else "error"
    if error and not success and error not in text:
        text = f"{text}\n\n{error}"

    try:
        return post_webui_message(
            resolve_agent_name(job, hermes_home=hermes_home),
            text,
            kind="cron",
            cron_type=cron_type,
            job_id=str(job.get("id") or ""),
            title=str(job.get("name") or job.get("id") or "Cron"),
            task_status=task_status,
            tone="cron-task" if cron_type == "task" and success else ("error" if not success else "cron"),
        )
    except Exception as exc:
        logger.debug("Hermes WebUI cron hook failed for job %s: %s", job.get("id"), exc)
        return False


def resolve_cron_type(job: dict) -> str:
    explicit = str(job.get("webui_cron_type") or job.get("cron_type") or "").strip().lower()
    if explicit in {"reminder", "task"}:
        return explicit

    blob = " ".join(
        str(value or "")
        for value in (
            job.get("name"),
            job.get("prompt"),
            job.get("script"),
            job.get("skill"),
        )
    ).lower()
    return "reminder" if any(marker.lower() in blob for marker in REMINDER_MARKERS) else "task"


def resolve_agent_name(job: dict, *, hermes_home: str | Path | None = None) -> str:
    profile = str(job.get("profile") or os.environ.get("HERMES_PROFILE") or "").strip().lower()
    if profile in PROFILE_AGENT_NAMES:
        return PROFILE_AGENT_NAMES[profile]

    home = str(hermes_home or os.environ.get("HERMES_HOME") or "").replace("\\", "/").lower()
    for key, agent_name in PROFILE_AGENT_NAMES.items():
        if f"/profiles/{key}" in home:
            return agent_name
    return "HermesFox"
