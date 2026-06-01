# Hermes WebUI WSL autostart

Run this once from Windows:

```bat
install-wsl-webui-autostart.cmd
```

After that, opening WSL starts the WebUI in Windows if it is not already running.
The helper checks `http://127.0.0.1:4173/api/agents` first, so repeated WSL tabs
do not create duplicate WebUI processes.

If your distro name is not `Ubuntu`, pass it explicitly:

```bat
install-wsl-webui-autostart.cmd -Distro HermesUbuntu2
```

To disable it:

```bat
uninstall-wsl-webui-autostart.cmd
```

Temporary skip for one WSL session:

```bash
export HERMES_WEBUI_AUTOSTART_SKIP=1
```
