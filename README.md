# Hermes WebUI Demo

English | [中文](#中文说明)

Hermes WebUI Demo is a local futuristic control surface for a four-agent Hermes team. It provides a visual dashboard for HermesFox, Hermies, BF, and deercare, with live agent messaging, Telegram synchronization, WSL command bridging, cron notifications, animated HUD effects, message history, and a clean desktop-style UI.

This repository is a demo-oriented WebUI layer. Real Hermes commands, local history, event logs, cron jobs, and private environment settings are intentionally excluded from the repository.

## Features

- Four-agent HUD for HermesFox, Hermies, BF, and deercare.
- Local WebUI server with live browser updates.
- Agent input composer with keyboard switching and message bubbles.
- Recent message history per agent.
- Telegram/WebUI synchronization hooks.
- WSL Hermes command bridge through local command configuration.
- Cron reminder and cron task display flow.
- Futuristic background, agent entrance animation, message arrival sound, and optimized SVG/CSS motion effects.
- Example command configuration files for safe setup.

## Quick Start

Requirements:

- Node.js 18 or newer.
- Windows PowerShell or Command Prompt.
- Optional: WSL with Hermes installed, if you want to connect real Hermes agents.

Install dependencies:

```powershell
npm install
```

Start the WebUI:

```powershell
npm run start
```

Then open:

```text
http://127.0.0.1:4173
```

You can also double-click:

```text
start-hermes-webui.cmd
```

## Connect Real Hermes Agents

Copy one of the example command files:

```powershell
copy hermes-agent-commands.example.json hermes-agent-commands.json
```

Then edit `hermes-agent-commands.json` for your local Hermes/WSL environment.

Private runtime files are ignored by Git:

- `hermes-agent-commands.json`
- `hermes-webui-cron-jobs.json`
- `hermes-webui-history.json`
- `hermes-webui-events.ndjson`
- `hermes-webui-inbox.ndjson`
- `.env*`

## Scripts

```powershell
npm run start
npm run check
npm run test
```

## Release Download

Download the latest packaged source from the GitHub Releases page:

[Releases](https://github.com/VannFok/hermes-webui-demo/releases)

## 中文说明

Hermes WebUI Demo 是一个给四个 Hermes agent 使用的本地未来感控制台。它为 HermesFox、Hermies、BF、deercare 提供可视化操作界面，支持实时消息、Telegram 同步、WSL 命令桥接、cron 提醒和任务展示、消息历史、HUD 动效，以及更接近桌面控制台的交互体验。

这个仓库主要是 WebUI demo 层。真实 Hermes 命令、本地历史记录、事件日志、cron 任务和私密环境配置不会上传到仓库。

## 功能

- HermesFox、Hermies、BF、deercare 四个 agent 顶部控制栏。
- 本地 WebUI 服务，浏览器实时使用。
- Agent 输入框、快捷切换、气泡消息。
- 每个 agent 的最近消息历史。
- Telegram 与 WebUI 同步接口。
- 通过本地命令配置接入 WSL Hermes。
- Cron 提醒与 cron 任务展示流程。
- 未来感背景、agent 出场动画、消息音效、优化后的 SVG/CSS 动效。
- 提供 example 配置文件，避免上传私密运行配置。

## 快速开始

要求：

- Node.js 18 或更新版本。
- Windows PowerShell 或命令提示符。
- 如果要接入真实 Hermes agent，需要 WSL 中已经安装并配置 Hermes。

安装依赖：

```powershell
npm install
```

启动 WebUI：

```powershell
npm run start
```

然后打开：

```text
http://127.0.0.1:4173
```

也可以直接双击：

```text
start-hermes-webui.cmd
```

## 接入真实 Hermes Agent

复制示例配置：

```powershell
copy hermes-agent-commands.example.json hermes-agent-commands.json
```

然后根据你的本地 Hermes/WSL 环境修改 `hermes-agent-commands.json`。

以下真实运行文件已被 Git 忽略：

- `hermes-agent-commands.json`
- `hermes-webui-cron-jobs.json`
- `hermes-webui-history.json`
- `hermes-webui-events.ndjson`
- `hermes-webui-inbox.ndjson`
- `.env*`

## 常用命令

```powershell
npm run start
npm run check
npm run test
```

## 下载 Release

可以从 GitHub Releases 页面下载最新打包版本：

[Releases](https://github.com/VannFok/hermes-webui-demo/releases)
