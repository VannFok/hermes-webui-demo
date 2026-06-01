# Hermes Telegram to WebUI sync

WebUI has two ingress paths:

- HTTP: `POST http://127.0.0.1:4173/api/telegram` and `/api/cron`
- Inbox fallback: append JSON lines to `hermes-webui-inbox.ndjson`

`npm run start` now watches the inbox file automatically. This matters for WSL:
if Hermes cannot reach the Windows WebUI HTTP port, the helper writes the same
payload to the inbox file and the WebUI relays it into the browser event stream.

## Python helper for WSL Hermes

Import this helper in the gateway path that sends the Telegram reply:

```python
import sys

sys.path.append("/mnt/d/CODEX项目/hermes-webui-demo/hermes-webui-demo/tools")
from hermes_webui_sync import post_webui_message

post_webui_message("HermesFox", reply_text, kind="telegram")
```

Cron updates use the same helper:

```python
post_webui_message("HermesFox", cron_text, kind="cron")
```

For the WSL Hermes cron scheduler, install the automatic hook once:

```bash
python3 /mnt/d/CODEX项目/hermes-webui-demo/hermes-webui-demo/tools/install_hermes_webui_cron_hook.py
```

The hook mirrors every delivered Hermes cron result into WebUI as `/api/cron`.
Simple reminders are tagged as `cronType="reminder"`; heavier jobs such as
writing and daily radar reports are tagged as `cronType="task"`. Restart the
Hermes gateway after installing the hook so the running scheduler imports the
patched code.

The helper first tries HTTP. If that fails, it appends to:

```text
D:\CODEX项目\hermes-webui-demo\hermes-webui-demo\hermes-webui-inbox.ndjson
```

This side effect should be best-effort: Telegram replies must still be sent even
when WebUI is closed.
