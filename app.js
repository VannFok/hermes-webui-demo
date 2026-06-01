(function () {
  const lightPillarHost = document.querySelector("#lightPillar");
  const bubblesLayer = document.querySelector("#bubblesLayer");
  const chipDock = document.querySelector("#chipDock");
  const historyPanel = document.querySelector("#historyPanel");
  const historyPanelAgent = document.querySelector("#historyPanelAgent");
  const historyPanelClose = document.querySelector("#historyPanelClose");
  const historyPanelList = document.querySelector("#historyPanelList");
  const historySearch = document.querySelector("#historySearch");
  const historySource = document.querySelector("#historySource");
  const historyDate = document.querySelector("#historyDate");
  const cronInbox = document.querySelector("#cronInbox");
  const cronInboxToggle = document.querySelector("#cronInboxToggle");
  const cronInboxPanel = document.querySelector("#cronInboxPanel");
  const cronInboxClose = document.querySelector("#cronInboxClose");
  const cronInboxList = document.querySelector("#cronInboxList");
  const cronInboxCount = document.querySelector("#cronInboxCount");
  const cronLayer = document.querySelector("#cronLayer");
  const bubbleTemplate = document.querySelector("#bubbleTemplate");
  const chipTemplate = document.querySelector("#chipTemplate");
  const depthValue = document.querySelector("#depthValue");
  const replyComposer = document.querySelector("#replyComposer");
  const replyTarget = document.querySelector("#replyTarget");
  const replyQuote = document.querySelector("#replyQuote");
  const replyQuoteLabel = document.querySelector("#replyQuoteLabel");
  const replyQuoteText = document.querySelector("#replyQuoteText");
  const queueState = document.querySelector("#queueState");
  const replyInput = document.querySelector("#replyInput");
  const sendReplyButton = document.querySelector("#sendReplyButton");
  const agentDots = [...document.querySelectorAll(".agent-dot")];

  const agents = [
    {
      id: "agent-01",
      name: "HermesFox",
      aliases: ["hermesfox", "fox"],
      color: "#43f7ff",
      avatar: "./avatars/agent-01-64.png",
      status: "scanner",
      messages: [
        "已完成远端队列扫描，发现 3 个等待确认的任务脉冲。",
        "我正在校验工具链响应时间，当前延迟保持在可接受窗口内。",
        "检测到新的上下文片段，已把关键事实推送到共享记忆层。",
        "路径清晰，可以继续向下一段执行链路推进。"
      ]
    },
    {
      id: "agent-02",
      name: "Hermies",
      aliases: ["hermies"],
      color: "#a76cff",
      avatar: "./avatars/agent-02-64.png",
      status: "planner",
      messages: [
        "我把候选方案压缩成两条主路径：快速 demo 和真实接入预留。",
        "风险点集中在消息风暴和气泡遮挡，已建议自动折叠策略。",
        "当前界面优先保留沉浸感，控制组件只放在 HUD 层。",
        "下一步可以挂载 WebSocket 适配器，UI 层无需重写。"
      ]
    },
    {
      id: "agent-03",
      name: "BF",
      aliases: ["bf", "builder"],
      color: "#6dffb5",
      avatar: "./avatars/agent-03-64.png",
      status: "builder",
      messages: [
        "已生成新的渲染片段，气泡坐标会避开顶部 HUD 和底部 dock。",
        "背景线路正在向观察点收束，透视速度随深度动态变化。",
        "最小化芯片已入队，点击即可恢复对应消息。",
        "我保持 DOM 节点上限，旧气泡会自动进入低干扰状态。"
      ]
    },
    {
      id: "agent-04",
      name: "deercare",
      aliases: ["deercare", "deer"],
      color: "#ffd166",
      avatar: "./avatars/agent-04-64.png",
      status: "watcher",
      messages: [
        "远端模拟心跳稳定，四个 agent 都在活跃范围内。",
        "我在观察视觉负载，当前展开消息数量仍然安全。",
        "新的事件已标记为高亮，焦点气泡将被置于最前。",
        "如果你点击空白空间，我会把当前消息压缩成边缘芯片。"
      ]
    }
  ];

  const state = {
    bubbles: [],
    minimized: [],
    pendingMessages: [],
    messageHistory: [],
    cronToasts: [],
    cronHistory: [],
    activeBubble: null,
    transitioning: false,
    replyOpen: false,
    replies: [],
    focusedId: null,
    composerMode: null,
    composerAgentId: null,
    composerQuote: null,
    composerSourceBubbleId: null,
    typingAgents: new Set(),
    typingStartedAt: new Map(),
    typingClearTimers: new Map(),
    clickFlashTimers: new Map(),
    running: true,
    quality: "fast",
    sequence: 0,
    topZ: 20,
    lastDepth: 0,
    lastAgentIndex: -1,
    audioUnlocked: false,
    pendingSoundAgentId: null,
    pendingStartupSound: false,
    pendingStartupSoundUntil: 0,
    baseTitle: document.title || "Hermes Team WebUI Demo",
    titleAlertTimer: 0,
    titleAlertAgent: "",
    titleAlertBlink: false,
    historyPanelAgentId: null,
    historyPanelRequest: 0,
    historyPanelDebounce: 0,
    cronInboxOpen: false
  };

  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  function resolveAgentFromInput(input) {
    const key = String(input?.agentId || input?.agent || input?.agentName || input?.name || input?.id || "")
      .trim()
      .toLowerCase();
    if (!key) return agents[0];

    return (
      agents.find((agent) => {
        const aliases = Array.isArray(agent.aliases) ? agent.aliases : [];
        return [agent.id, agent.name, ...aliases].some((value) => String(value).toLowerCase() === key);
      }) || agents[0]
    );
  }

  const originByAgentId = {
    "agent-01": "top-left",
    "agent-02": "top-right",
    "agent-03": "bottom-left",
    "agent-04": "bottom-right"
  };
  const startupAgentEntranceOrder = ["agent-01", "agent-02", "agent-03", "agent-04"];
  const maxExpandedBubbles = 12;
  const minTypingVisibleMs = 3000;
  const maxMessageHistory = 60;
  const maxCronToasts = 4;
  const maxCronHistory = 30;
  const cronToastLifetimeMs = 180000;
  const startupSoundQueueWindowMs = 5200;
  let viewport = { width: 1, height: 1, dpr: 1, centerX: 0, centerY: 0 };
  let adapter;
  let lightPillar;
  let audioContext;
  let repositionFrame = 0;

  class MockMessageAdapter {
    constructor(onMessage) {
      this.onMessage = onMessage;
      this.timer = null;
      this.running = false;
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.schedule(260);
    }

    stop() {
      this.running = false;
      window.clearTimeout(this.timer);
    }

    emitNow() {
      this.onMessage(createMockMessage());
    }

    schedule(delay) {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        if (!this.running) return;
        this.emitNow();
        this.schedule(randomBetween(1850, 3600));
      }, delay);
    }
  }

  function createMockMessage() {
    state.lastAgentIndex = (state.lastAgentIndex + 1) % agents.length;
    const agent = agents[state.lastAgentIndex];
    const text = agent.messages[Math.floor(Math.random() * agent.messages.length)];
    state.sequence += 1;

    return {
      id: `msg-${Date.now()}-${state.sequence}`,
      agentId: agent.id,
      agentName: agent.name,
      text,
      timestamp: new Date().toISOString(),
      tone: agent.status
    };
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function runAfterFirstPaint(callback) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(callback);
    });
  }

  function resizeViewport() {
    viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: 1,
      centerX: window.innerWidth / 2,
      centerY: window.innerHeight / 2
    };
    repositionBubbles();
    repositionCronToasts();
  }

  function receiveMessage(message) {
    const agent = agentById.get(message.agentId) || resolveAgentFromInput(message);
    startTitleAlert(agent.name);
    if (shouldRememberMessage(message)) rememberMessage(message);
    state.pendingMessages.push(message);
    if (state.pendingMessages.length > 24) {
      state.pendingMessages.splice(0, state.pendingMessages.length - 24);
    }
    updateReplyState();
    showNextMessage();
  }

  function rememberMessage(message) {
    const existingIndex = state.messageHistory.findIndex((entry) => entry.id === message.id);
    if (existingIndex >= 0) state.messageHistory.splice(existingIndex, 1);
    state.messageHistory.push({ ...message });
    state.messageHistory.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    if (state.messageHistory.length > maxMessageHistory) {
      state.messageHistory.splice(0, state.messageHistory.length - maxMessageHistory);
    }
    renderDrawer();
  }

  function shouldRememberMessage(message) {
    if (message?.persist === false) return false;
    const source = String(message?.source || "").toLowerCase();
    const kind = String(message?.kind || "").toLowerCase();
    if (source === "test" || source === "system" || source === "cron") return false;
    if (kind === "cron" || kind === "system") return false;
    return true;
  }

  function pushAgentMessage(input) {
    const agent = resolveAgentFromInput(input);
    const text = String(input?.text || "").trim();
    if (!text) return;
    clearTypingAgent(agent.id, { immediate: true });

    if (isCronMessageInput(input)) {
      receiveCronMessage(input, agent, text);
      return;
    }

    receiveMessage({
      id: input.id || `hermes-${Date.now()}-${state.sequence + 1}`,
      agentId: agent.id,
      agentName: input.agentName || agent.name,
      text,
      timestamp: input.timestamp || new Date().toISOString(),
      tone: input.tone || agent.status,
      source: input.source || "bridge"
    });
  }

  function isCronMessageInput(input) {
    const marker = String(input?.kind || input?.type || input?.channel || input?.source || "").toLowerCase();
    return marker === "cron" || marker === "schedule" || marker === "scheduled";
  }

  function receiveCronMessage(input, agent, text) {
    if (!cronLayer) return;
    const cronType = normalizeCronType(input);

    const message = {
      id: input.id || `cron-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      agentId: agent.id,
      agentName: input.agentName || agent.name,
      text,
      timestamp: input.timestamp || new Date().toISOString(),
      tone: input.tone || "cron",
      kind: "cron",
      source: input.source || "cron",
      cronType,
      jobId: input.jobId || input.cronJobId || null,
      title: input.title || "",
      taskStatus: input.taskStatus || null
    };
    rememberCronMessage(message);

    if (cronType === "task") {
      receiveCronTaskMessage(message, agent);
      return;
    }

    const toast = createCronToast(message, agent);
    cronLayer.appendChild(toast.element);
    state.cronToasts.push(toast);

    while (state.cronToasts.length > maxCronToasts) {
      dismissCronToast(state.cronToasts[0].id, { fast: true });
    }

    cronLayer.setAttribute("aria-hidden", "false");
    repositionCronToasts();
    startTitleAlert(agent.name);
    playMessageSound(agent);

    window.requestAnimationFrame(() => {
      toast.element.classList.add("is-visible");
    });

    toast.timer = window.setTimeout(() => dismissCronToast(toast.id), cronToastLifetimeMs);
  }

  function normalizeCronType(input) {
    return String(input?.cronType || input?.type || "").toLowerCase() === "task" ? "task" : "reminder";
  }

  function receiveCronTaskMessage(message, agent) {
    state.pendingMessages.push({
      ...message,
      id: message.id || `cron-task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      agentId: agent.id,
      agentName: message.agentName || agent.name,
      tone: message.taskStatus === "error" ? "error" : "cron task",
      kind: "cron",
      source: "cron",
      cronType: "task",
      origin: "top-right",
      persist: false
    });
    if (state.pendingMessages.length > 24) {
      state.pendingMessages.splice(0, state.pendingMessages.length - 24);
    }
    startTitleAlert(agent.name);
    showNextMessage();
  }

  function rememberCronMessage(message) {
    const existingIndex = state.cronHistory.findIndex((entry) => entry.id === message.id);
    if (existingIndex >= 0) state.cronHistory.splice(existingIndex, 1);
    state.cronHistory.unshift({ ...message });
    if (state.cronHistory.length > maxCronHistory) {
      state.cronHistory.splice(maxCronHistory);
    }
    renderCronInbox();
  }

  function loadCronHistoryFromServer() {
    if (!window.fetch) return;
    window
      .fetch(`/api/cron/history?limit=${maxCronHistory}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!Array.isArray(payload?.messages)) return;
        state.cronHistory = payload.messages.slice(0, maxCronHistory);
        renderCronInbox();
      })
      .catch(() => {
        renderCronInbox();
      });
  }

  function setCronInboxOpen(open) {
    state.cronInboxOpen = open;
    cronInbox?.classList.toggle("is-open", open);
    cronInboxToggle?.setAttribute("aria-expanded", open ? "true" : "false");
    cronInboxPanel?.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) renderCronInbox();
  }

  function renderCronInbox() {
    if (!cronInbox || !cronInboxList || !cronInboxCount) return;

    cronInbox.classList.toggle("has-items", state.cronHistory.length > 0);
    cronInboxCount.textContent = String(Math.min(state.cronHistory.length, 99));
    cronInboxList.replaceChildren();

    if (!state.cronHistory.length) {
      const empty = document.createElement("p");
      empty.className = "cron-inbox__empty";
      empty.textContent = "暂无 cron 记录";
      cronInboxList.appendChild(empty);
      return;
    }

    for (const message of state.cronHistory) {
      const agent = agentById.get(message.agentId) || resolveAgentFromInput(message);
      const cronType = normalizeCronType(message);
      const item = document.createElement(cronType === "task" ? "button" : "article");
      item.className = `cron-inbox__item is-${cronType}`;
      if (cronType === "task") item.type = "button";
      item.style.setProperty("--agent-color", agent.color);
      item.innerHTML = `
        <div>
          <strong></strong>
          <time></time>
          <span class="cron-inbox__type"></span>
        </div>
        <p></p>
      `;
      item.querySelector("strong").textContent = message.title || agent.name;
      item.querySelector("time").textContent = formatTime(message.timestamp);
      item.querySelector(".cron-inbox__type").textContent = cronType === "task" ? "TASK" : "REMIND";
      item.querySelector("p").textContent = message.text;
      if (cronType === "task") {
        item.addEventListener("click", () => {
          setCronInboxOpen(false);
          receiveCronTaskMessage({ ...message, id: `${message.id}-reopen-${Date.now()}` }, agent);
        });
      }
      cronInboxList.appendChild(item);
    }
  }

  function createCronToast(message, agent) {
    const element = document.createElement("article");
    element.className = "cron-toast";
    element.dataset.id = message.id;
    element.style.setProperty("--agent-color", agent.color);
    element.style.setProperty("--agent-avatar", `url("${agent.avatar}")`);
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    element.addEventListener("pointerdown", (event) => event.stopPropagation());

    const head = document.createElement("div");
    head.className = "cron-toast__head";

    const avatar = document.createElement("span");
    avatar.className = "cron-toast__avatar";
    avatar.setAttribute("aria-hidden", "true");

    const meta = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${agent.name} · cron`;
    const time = document.createElement("time");
    time.textContent = formatTime(message.timestamp);
    meta.append(title, time);

    const badge = document.createElement("span");
    badge.className = "cron-toast__badge";
    badge.textContent = "CRON";

    const textNode = document.createElement("p");
    textNode.className = "cron-toast__text";
    textNode.textContent = message.text;

    head.append(avatar, meta, badge);
    element.append(head, textNode);

    return {
      id: message.id,
      message,
      agent,
      element,
      timer: 0
    };
  }

  function repositionCronToasts() {
    if (!cronLayer || !state.cronToasts.length) return;

    let stackY = 0;
    for (const toast of state.cronToasts) {
      positionCronToast(toast, stackY);
      stackY += Math.min((toast.element.offsetHeight || 88) + 10, 136);
    }
  }

  function positionCronToast(toast, stackY = 0) {
    const right = viewport.width < 620 ? 12 : 24;
    const top = (viewport.width < 980 ? 150 : 146) + stackY;
    const dot = agentDots.find((item) => item.dataset.agent === toast.agent.id);
    const dotRect = dot?.getBoundingClientRect();
    const width = toast.element.offsetWidth || Math.min(360, viewport.width - 48);
    const height = toast.element.offsetHeight || 96;
    const targetCenterX = viewport.width - right - width / 2;
    const targetCenterY = top + height / 2;
    const originCenterX = dotRect ? dotRect.left + dotRect.width / 2 : targetCenterX;
    const originCenterY = dotRect ? dotRect.top + dotRect.height / 2 : targetCenterY;

    toast.element.style.right = `${right}px`;
    toast.element.style.top = `${Math.round(top)}px`;
    toast.element.style.setProperty("--cron-origin-x", `${Math.round(originCenterX - targetCenterX)}px`);
    toast.element.style.setProperty("--cron-origin-y", `${Math.round(originCenterY - targetCenterY)}px`);
  }

  function dismissCronToast(id, options = {}) {
    const index = state.cronToasts.findIndex((toast) => toast.id === id);
    if (index === -1) return;

    const [toast] = state.cronToasts.splice(index, 1);
    window.clearTimeout(toast.timer);
    toast.element.classList.add("is-leaving");

    if (options.fast) {
      toast.element.remove();
      if (!state.cronToasts.length) cronLayer?.setAttribute("aria-hidden", "true");
      repositionCronToasts();
      return;
    }

    window.setTimeout(() => {
      toast.element.remove();
      if (!state.cronToasts.length) cronLayer?.setAttribute("aria-hidden", "true");
    }, 720);
    repositionCronToasts();
  }

  function publishHermesInterface() {
    window.HermesWebUI = {
      pushMessage: pushAgentMessage,
      pushCron: (input) => pushAgentMessage({ ...input, kind: "cron", source: "cron" }),
      openInput: openAgentComposer,
      send: sendToHermes,
      setActiveAgent,
      startDemo: startDemoMessages,
      stopDemo: stopDemoMessages,
      agents: agents.map(({ id, name, status, color, avatar, aliases }) => ({ id, name, status, color, avatar, aliases }))
    };
  }

  function shouldRunDemoMessages() {
    const params = new URLSearchParams(window.location.search);
    return params.get("demo") === "1" || params.get("mock") === "1";
  }

  function startDemoMessages() {
    if (!adapter) adapter = new MockMessageAdapter(receiveMessage);

    runAfterFirstPaint(() => {
      adapter.start();
      window.setTimeout(() => adapter.emitNow(), 720);
      window.setTimeout(() => adapter.emitNow(), 1380);
    });
  }

  function stopDemoMessages() {
    if (!adapter) return;
    adapter.stop();
  }

  function canUseHermesBridge() {
    return window.fetch && (window.location.protocol === "http:" || window.location.protocol === "https:");
  }

  function sendToHermes(input) {
    if (!canUseHermesBridge()) {
      clearTypingAgent(input.agentId);
      return;
    }

    window
      .fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      })
      .catch(() => {
        clearTypingAgent(input.agentId);
        pushAgentMessage({
          agentId: input.agentId,
          agentName: input.agentName,
          tone: "error",
          text: "WebUI 没有连上本地 Hermes 桥接服务。请确认 start-hermes-webui.cmd 窗口仍在运行。"
        });
      });
  }

  function connectHermesBridge() {
    if (!window.EventSource || window.location.protocol === "file:") return;

    const source = new EventSource("/events");
    const readPayload = (event) => {
      try {
        return JSON.parse(event.data);
      } catch {
        return null;
      }
    };
    const receiveBridgeMessage = (event) => {
      const payload = readPayload(event);
      if (payload) pushAgentMessage(payload);
    };

    source.addEventListener("message", receiveBridgeMessage);
    source.addEventListener("agent_message", receiveBridgeMessage);
    source.addEventListener("telegram_message", receiveBridgeMessage);
    source.addEventListener("cron_message", receiveBridgeMessage);
    source.addEventListener("agent_status", (event) => {
      const payload = readPayload(event);
      if (!payload) return;
      const agent = resolveAgentFromInput(payload);
      setActiveAgent(agent.id);
      setTypingAgent(agent.id);
    });
    window.addEventListener("beforeunload", () => source.close(), { once: true });
  }

  function loadHistoryFromServer() {
    if (!canUseHermesBridge()) {
      renderDrawer();
      return;
    }

    window
      .fetch("/api/history", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload?.history) return;
        applyServerHistory(payload.history);
      })
      .catch(() => {
        renderDrawer();
      });
  }

  function applyServerHistory(history) {
    const seen = new Set(state.messageHistory.map((message) => message.id));
    const loaded = [];
    for (const agent of agents) {
      const items = Array.isArray(history[agent.id]) ? history[agent.id] : [];
      for (const message of items) {
        if (!message?.id || seen.has(message.id)) continue;
        seen.add(message.id);
        loaded.push({
          ...message,
          agentId: agent.id,
          agentName: message.agentName || agent.name
        });
      }
    }
    state.messageHistory.push(...loaded);
    state.messageHistory.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    if (state.messageHistory.length > maxMessageHistory) {
      state.messageHistory.splice(0, state.messageHistory.length - maxMessageHistory);
    }
    renderDrawer();
  }

  function createBubble(message, agent) {
    const fragment = bubbleTemplate.content.cloneNode(true);
    const element = fragment.querySelector(".message-bubble");
    const isCronTask = message.cronType === "task";
    element.dataset.id = message.id;
    element.style.setProperty("--agent-color", agent.color);
    element.style.setProperty("--agent-avatar", `url("${agent.avatar}")`);
    element.classList.add("from-origin");
    element.style.setProperty("--drift-duration", `${randomBetween(6.2, 9.6).toFixed(2)}s`);
    element.style.setProperty("--drift-x", `${randomBetween(2, 7).toFixed(1)}px`);
    element.style.setProperty("--drift-y", `${randomBetween(2, 6).toFixed(1)}px`);
    if (isCronTask) element.classList.add("is-cron-task");
    element.querySelector(".bubble-agent").textContent = `${message.agentName} · ${message.tone}`;
    if (isCronTask) {
      element.querySelector(".bubble-agent").textContent = `${message.title || message.agentName} · CRON TASK`;
    }
    element.querySelector(".bubble-time").textContent = formatTime(message.timestamp);
    const textElement = element.querySelector(".bubble-text");
    textElement.textContent = "";
    textElement.setAttribute("aria-label", message.text);
    element.querySelector(".bubble-copy").addEventListener("click", (event) => {
      event.stopPropagation();
      copyBubbleText(message.text, event.currentTarget);
    });
    element.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      focusBubble(message.id);
      openReplyComposer();
    });
    element.addEventListener("wheel", (event) => routeBubbleWheel(event, textElement), { passive: false });
    element.addEventListener("focus", () => focusBubble(message.id));
    element.addEventListener("keydown", (event) => {
      if (event.key === "Escape") dismissActiveBubble();
    });

    return {
      id: message.id,
      message,
      agent,
      origin: message.origin || originByAgentId[agent.id] || "top-left",
      element,
      textElement,
      minimized: false,
      streamFrame: 0,
      createdAt: Date.now()
    };
  }

  async function copyBubbleText(text, button) {
    const value = String(text || "");
    if (!value || !button) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        copyTextFallback(value);
      }
      markCopyButton(button, true);
    } catch {
      try {
        copyTextFallback(value);
        markCopyButton(button, true);
      } catch {
        markCopyButton(button, false);
      }
    }
  }

  function copyTextFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("copy failed");
  }

  function markCopyButton(button, copied) {
    button.classList.remove("is-copied", "is-copy-error");
    button.classList.add(copied ? "is-copied" : "is-copy-error");
    button.setAttribute("aria-label", copied ? "已复制" : "复制失败");
    button.title = copied ? "已复制" : "复制失败";
    window.setTimeout(() => {
      button.classList.remove("is-copied", "is-copy-error");
      button.setAttribute("aria-label", "复制文本");
      button.title = "复制文本";
    }, copied ? 900 : 1200);
  }

  function showNextMessage() {
    if (state.activeBubble || state.transitioning || state.replyOpen || state.pendingMessages.length === 0) return;

    const message = state.pendingMessages.pop();
    const agent = agentById.get(message.agentId) || agents[0];
    const bubble = createBubble(message, agent);
    state.bubbles.push(bubble);
    state.activeBubble = bubble;
    state.focusedId = bubble.id;
    bubblesLayer.appendChild(bubble.element);
    bubble.textElement.textContent = bubble.message.text || "";
    positionBubbleAtCenter(bubble);
    bubble.textElement.textContent = "";
    playMessageSound(agent);

    window.requestAnimationFrame(() => {
      bubble.element.classList.remove("from-origin");
      bubble.element.classList.add("is-visible", "is-focused");
      focusBubble(bubble.id);
      streamBubbleText(bubble);
    });

    setActiveAgent(agent.id);
    updateReplyState();
  }

  function positionBubbleAtCenter(bubble) {
    const rect = getSafeRect();
    applyBubbleSizeLimits(bubble, rect);
    const width = bubble.element.offsetWidth || Math.min(350, viewport.width - 32);
    const height = bubble.element.offsetHeight || 150;
    const centerX = clamp((viewport.width - width) / 2, rect.left, Math.max(rect.left, rect.right - width));
    const verticalLift = viewport.width < 620 ? 22 : 36;
    const centerY = clamp((viewport.height - height) / 2 - verticalLift, rect.top, Math.max(rect.top, rect.bottom - height));
    const origin = getCornerOrigin(bubble.origin, width, height);

    bubble.element.style.left = `${Math.round(centerX)}px`;
    bubble.element.style.top = `${Math.round(centerY)}px`;
    bubble.element.style.setProperty("--origin-x", `${Math.round(origin.x - centerX)}px`);
    bubble.element.style.setProperty("--origin-y", `${Math.round(origin.y - centerY)}px`);
  }

  function applyBubbleSizeLimits(bubble, rect = getSafeRect()) {
    const availableHeight = Math.max(180, rect.bottom - rect.top);
    const maxBubbleHeight = Math.min(viewport.width < 620 ? 520 : 560, availableHeight);
    const maxTextHeight = Math.max(96, maxBubbleHeight - (viewport.width < 620 ? 132 : 154));
    bubble.element.style.setProperty("--bubble-max-height", `${Math.floor(maxBubbleHeight)}px`);
    bubble.element.style.setProperty("--bubble-text-max-height", `${Math.floor(maxTextHeight)}px`);
  }

  function routeBubbleWheel(event, textElement) {
    if (!textElement || textElement.scrollHeight <= textElement.clientHeight + 2) return;
    const before = textElement.scrollTop;
    textElement.scrollTop += event.deltaY;
    if (textElement.scrollTop !== before) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function getCornerOrigin(origin, width, height) {
    const margin = viewport.width < 620 ? 8 : 18;
    const isRight = origin.includes("right");
    const isBottom = origin.includes("bottom");
    return {
      x: isRight ? viewport.width - width * 0.45 - margin : -width * 0.55 + margin,
      y: isBottom ? viewport.height - height * 0.45 - margin : -height * 0.55 + margin
    };
  }

  function placeBubble(bubble) {
    const rect = getSafeRect();
    const width = bubble.element.offsetWidth || Math.min(350, viewport.width - 32);
    const height = bubble.element.offsetHeight || 150;
    const x = randomBetween(rect.left, Math.max(rect.left, rect.right - width));
    const y = randomBetween(rect.top, Math.max(rect.top, rect.bottom - height));
    bubble.element.style.left = `${Math.round(x)}px`;
    bubble.element.style.top = `${Math.round(y)}px`;
  }

  function repositionBubbles() {
    if (state.activeBubble && !state.transitioning) positionBubbleAtCenter(state.activeBubble);
  }

  function scheduleBubbleReposition() {
    window.cancelAnimationFrame(repositionFrame);
    repositionFrame = window.requestAnimationFrame(() => {
      repositionFrame = 0;
      repositionBubbles();
    });
  }

  function getSafeRect() {
    const top = viewport.width < 980 ? 206 : 104;
    const composerHeight = state.replyOpen ? replyComposer.getBoundingClientRect().height || 132 : 0;
    const bottomReserve = state.replyOpen ? composerHeight + 34 : 84;
    const bottom = viewport.height - bottomReserve;
    return {
      left: viewport.width < 620 ? 12 : 28,
      top,
      right: viewport.width - (viewport.width < 620 ? 12 : 28),
      bottom: Math.max(top + 160, bottom)
    };
  }

  function focusBubble(id) {
    state.focusedId = id;
    state.topZ += 1;
    for (const bubble of state.bubbles) {
      const focused = bubble.id === id && bubble === state.activeBubble;
      bubble.element.classList.toggle("is-focused", focused);
      if (focused) bubble.element.style.zIndex = state.topZ;
    }
  }

  function streamBubbleText(bubble) {
    if (!bubble?.textElement) return;

    const text = bubble.message.text || "";
    const units = Array.from(text);
    const duration = clamp(units.length * 14, 360, 1200);
    const startTime = performance.now();
    let lastCount = 0;

    window.cancelAnimationFrame(bubble.streamFrame);
    bubble.textElement.textContent = "";
    bubble.element.classList.add("is-streaming");

    const tick = (now) => {
      if (!bubble.element.isConnected) return;

      const progress = clamp((now - startTime) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 2.2);
      const count = Math.min(units.length, Math.max(lastCount + 1, Math.ceil(units.length * eased)));

      if (count !== lastCount) {
        bubble.textElement.textContent = units.slice(0, count).join("");
        lastCount = count;
      }

      if (count < units.length) {
        bubble.streamFrame = window.requestAnimationFrame(tick);
      } else {
        bubble.streamFrame = 0;
        bubble.element.classList.remove("is-streaming");
      }
    };

    bubble.streamFrame = window.requestAnimationFrame(tick);
  }

  function finishBubbleStream(bubble) {
    if (!bubble?.textElement) return;
    window.cancelAnimationFrame(bubble.streamFrame);
    bubble.streamFrame = 0;
    bubble.textElement.textContent = bubble.message.text || "";
    bubble.element.classList.remove("is-streaming");
  }

  function openHistoryComposer(message, index = 0) {
    const agent = agentById.get(message.agentId) || resolveAgentFromInput(message);
    openAgentComposer(agent.id, {
      quote: index > 0 ? message : null,
      flash: false,
      mode: index > 0 ? "history-reply" : "agent"
    });
  }

  function setComposerQuote(quote, agent) {
    state.composerQuote = quote
      ? {
          id: quote.id,
          text: quote.text || "",
          timestamp: quote.timestamp || "",
          agentId: agent.id,
          agentName: agent.name
        }
      : null;

    replyComposer.classList.toggle("has-quote", Boolean(state.composerQuote));
    if (!replyQuote || !replyQuoteLabel || !replyQuoteText) return;

    if (!state.composerQuote) {
      replyQuote.hidden = true;
      replyQuoteLabel.textContent = "";
      replyQuoteText.textContent = "";
      return;
    }

    replyQuote.hidden = false;
    replyQuoteLabel.textContent = `Quoted ${agent.name} · ${formatTime(state.composerQuote.timestamp)}`;
    replyQuoteText.textContent = state.composerQuote.text;
  }

  function openReplyComposer() {
    const bubble = state.activeBubble;
    if (!bubble || state.transitioning || state.replyOpen) return;

    setDrawerHidden(true);
    const latest = getRecentMessagesForAgent(bubble.agent.id)[0];
    const quote = latest?.id === bubble.message.id ? null : bubble.message;
    state.replyOpen = true;
    state.composerMode = quote ? "history-reply" : "message-direct";
    state.composerAgentId = bubble.agent.id;
    state.composerSourceBubbleId = bubble.id;
    replyComposer.style.setProperty("--composer-color", bubble.agent.color);
    replyComposer.classList.toggle("is-direct", !quote);
    finishBubbleStream(bubble);
    bubble.element.classList.add("is-replying");
    setComposerQuote(quote, bubble.agent);
    replyTarget.textContent = quote ? `Reply to ${bubble.agent.name}` : `${bubble.agent.name} channel`;
    replyInput.value = "";
    sendReplyButton.disabled = true;
    replyComposer.classList.add("is-open");
    replyComposer.setAttribute("aria-hidden", "false");
    updateReplyState();
    scheduleBubbleReposition();
    focusReplyInputSoon();
  }

  function focusReplyInputSoon() {
    window.requestAnimationFrame(() => {
      replyInput.focus({ preventScroll: true });
    });
  }

  function openAgentComposer(agentId, options = {}) {
    const agent = agentById.get(agentId);
    if (!agent || state.transitioning) return;

    setDrawerHidden(true);
    const quote = options.quote || null;
    state.replyOpen = true;
    state.composerMode = options.mode || (quote ? "history-reply" : "agent");
    state.composerAgentId = agent.id;
    state.composerSourceBubbleId = options.sourceBubbleId || null;
    if (state.activeBubble) state.activeBubble.element.classList.remove("is-replying");

    replyComposer.style.setProperty("--composer-color", agent.color);
    replyComposer.classList.add("is-open");
    replyComposer.classList.toggle("is-direct", !quote);
    replyComposer.setAttribute("aria-hidden", "false");
    setComposerQuote(quote, agent);
    replyTarget.textContent = quote ? `Reply to ${agent.name}` : `${agent.name} channel`;
    replyInput.value = "";
    sendReplyButton.disabled = true;
    setActiveAgent(agent.id);
    if (options.flash !== false) flashAgentClick(agent.id);
    updateReplyState();
    scheduleBubbleReposition();
    focusReplyInputSoon();
  }

  function closeReplyComposer(options = {}) {
    const directMode = state.composerMode === "agent" || state.composerMode === "message-direct";
    state.replyOpen = false;
    state.composerMode = null;
    state.composerAgentId = null;
    state.composerSourceBubbleId = null;
    setComposerQuote(null, agents[0]);
    replyComposer.classList.remove("is-open");
    replyComposer.classList.remove("is-direct");
    replyComposer.setAttribute("aria-hidden", "true");
    setDrawerHidden(false);
    if (state.activeBubble) state.activeBubble.element.classList.remove("is-replying");
    if (directMode && state.activeBubble) {
      setActiveAgent(state.activeBubble.agent.id);
    }
    syncThinkingAgentFromTyping();
    scheduleBubbleReposition();
    updateReplyState();
  }

  function sendReply() {
    const sourceBubble = state.composerSourceBubbleId && state.activeBubble?.id === state.composerSourceBubbleId
      ? state.activeBubble
      : null;
    const quote = state.composerQuote;
    const agent = agentById.get(state.composerAgentId) || sourceBubble?.agent;
    const text = replyInput.value.trim();
    if (!state.replyOpen || !agent || !text) return;
    const mode = quote ? "reply" : state.composerMode || "agent";

    state.replies.push({
      messageId: quote ? quote.id : null,
      agentId: agent.id,
      text,
      replyToText: quote ? quote.text : "",
      replyToTimestamp: quote ? quote.timestamp : null,
      mode,
      timestamp: new Date().toISOString()
    });
    setTypingAgent(agent.id);
    sendToHermes({
      messageId: quote ? quote.id : null,
      agentId: agent.id,
      agentName: agent.name,
      text,
      replyToText: quote ? quote.text : "",
      replyToTimestamp: quote ? quote.timestamp : null,
      mode,
      timestamp: new Date().toISOString()
    });

    closeReplyComposer({ keepTyping: true });
    if (sourceBubble) dismissActiveBubble({ afterReply: true });
    else showNextMessage();
  }

  function updateReplyState() {
    if (state.replyOpen && state.composerQuote) {
      queueState.textContent = "REPLY CONTEXT";
    } else if (state.replyOpen && (state.composerMode === "agent" || state.composerMode === "message-direct")) {
      queueState.textContent = "DIRECT INPUT";
    } else {
      queueState.textContent = `${state.pendingMessages.length} pending`;
    }
    sendReplyButton.disabled = !state.replyOpen || !replyInput.value.trim();
  }

  function setDrawerHidden(hidden) {
    chipDock?.classList.toggle("is-composer-hidden", hidden);
  }

  function dismissActiveBubble(options = {}) {
    const bubble = state.activeBubble;
    if (!bubble || state.transitioning) return;
    if (state.replyOpen && !options.afterReply) return;

    state.transitioning = true;
    finishBubbleStream(bubble);
    bubble.element.classList.remove("is-focused");
    bubble.element.classList.remove("is-replying");
    bubble.element.classList.add("is-returning");

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      bubble.element.removeEventListener("transitionend", handleTransitionEnd);
      bubble.element.remove();
      state.activeBubble = null;
      state.focusedId = null;
      state.transitioning = false;
      syncThinkingAgentFromTyping();
      updateReplyState();
      if (typeof options.onFinish === "function") options.onFinish();
      showNextMessage();
    };

    const handleTransitionEnd = (event) => {
      if (event.propertyName === "transform") finish();
    };

    bubble.element.addEventListener("transitionend", handleTransitionEnd);
    window.setTimeout(finish, 720);
  }

  function minimizeBubble(id) {
    const bubble = state.bubbles.find((entry) => entry.id === id && !entry.minimized);
    if (!bubble) return;

    const bubbleRect = bubble.element.getBoundingClientRect();
    finishBubbleStream(bubble);
    const dockRect = chipDock.getBoundingClientRect();
    const targetX = dockRect.left + 42 - bubbleRect.left;
    const targetY = dockRect.top + 18 - bubbleRect.top;
    bubble.element.style.setProperty("--min-x", `${Math.round(targetX)}px`);
    bubble.element.style.setProperty("--min-y", `${Math.round(targetY)}px`);
    bubble.element.classList.remove("is-focused");
    bubble.element.classList.add("is-minimizing");
    bubble.minimized = true;

    window.setTimeout(() => {
      if (bubble.element.parentNode) bubble.element.remove();
      renderChip(bubble);
    }, 260);

    if (state.focusedId === id) {
      state.focusedId = newestExpandedBubble()?.id || null;
      if (state.focusedId) focusBubble(state.focusedId);
    }
  }

  function renderChip(bubble) {
    if (state.minimized.some((entry) => entry.id === bubble.id)) return;
    state.minimized.push(bubble);
    renderDrawer();
  }

  function restoreBubble(id) {
    const index = state.minimized.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    const [bubble] = state.minimized.splice(index, 1);
    renderDrawer();

    bubble.minimized = false;
    bubble.element.classList.remove("is-minimizing");
    bubble.element.classList.remove("is-visible");
    bubblesLayer.appendChild(bubble.element);
    placeBubble(bubble);
    window.requestAnimationFrame(() => {
      bubble.element.classList.add("is-visible");
      focusBubble(bubble.id);
      finishBubbleStream(bubble);
      playMessageSound(bubble.agent);
    });
    enforceBubbleLimit();
  }

  function renderDrawer() {
    if (!chipDock) return;
    chipDock.replaceChildren();

    for (const agent of agents) {
      chipDock.appendChild(renderHistoryGroup(agent));
    }

    for (const [index, bubble] of state.minimized.entries()) {
      chipDock.appendChild(renderMinimizedChip(bubble, index));
    }
  }

  function renderHistoryGroup(agent) {
    const group = document.createElement("section");
    group.className = "history-agent-group";
    group.style.setProperty("--agent-color", agent.color);

    const header = document.createElement("div");
    header.className = "history-agent-head";

    const avatar = document.createElement("span");
    avatar.className = "history-agent-avatar";
    avatar.style.setProperty("--agent-avatar", `url("${agent.avatar}")`);
    avatar.setAttribute("aria-hidden", "true");

    const name = document.createElement("strong");
    name.textContent = agent.name;

    const label = document.createElement("span");
    label.className = "history-count";
    label.textContent = "last 3";

    const more = document.createElement("button");
    more.type = "button";
    more.className = "history-more";
    more.textContent = "更多";
    more.addEventListener("pointerdown", (event) => event.stopPropagation());
    more.addEventListener("click", () => openHistoryPanel(agent.id));

    header.append(avatar, name, label, more);

    const list = document.createElement("div");
    list.className = "history-message-list";
    const messages = getRecentMessagesForAgent(agent.id);

    if (!messages.length) {
      const empty = document.createElement("span");
      empty.className = "history-empty";
      empty.textContent = "No messages yet";
      list.appendChild(empty);
    } else {
      for (const [index, message] of messages.entries()) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "history-chip";
        item.classList.toggle("is-quote", index > 0);
        item.title = message.text;
        item.innerHTML = `
          <span class="history-chip__time"></span>
          <span class="history-chip__text"></span>
          <span class="history-chip__mode"></span>
        `;
        item.style.setProperty("--stack-index", index);
        item.querySelector(".history-chip__time").textContent = formatTime(message.timestamp);
        item.querySelector(".history-chip__text").textContent = message.text;
        item.querySelector(".history-chip__mode").textContent = index === 0 ? "new" : `#${index + 1}`;
        item.addEventListener("pointerdown", (event) => event.stopPropagation());
        item.addEventListener("click", () => showHistoryMessage(message));
        list.appendChild(item);
      }
    }

    group.append(header, list);
    return group;
  }

  function renderMinimizedChip(bubble, index) {
    const fragment = chipTemplate.content.cloneNode(true);
    const chip = fragment.querySelector(".message-chip");
    chip.dataset.minimizedId = bubble.id;
    chip.classList.add("is-minimized");
    chip.style.setProperty("--agent-color", bubble.agent.color);
    chip.querySelector(".chip-agent").textContent = bubble.agent.name;
    chip.querySelector(".chip-count").textContent = `#${String(index + 1).padStart(2, "0")}`;
    chip.title = bubble.message.text;
    chip.addEventListener("pointerdown", (event) => event.stopPropagation());
    chip.addEventListener("click", () => {
      unlockAudio();
      restoreBubble(bubble.id);
    });
    return chip;
  }

  function getRecentMessagesForAgent(agentId) {
    return state.messageHistory
      .filter((message) => message.agentId === agentId)
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, 3);
  }

  function openHistoryPanel(agentId) {
    const agent = agentById.get(agentId) || agents[0];
    if (!historyPanel || !agent) return;

    state.historyPanelAgentId = agent.id;
    historyPanel.style.setProperty("--agent-color", agent.color);
    historyPanel.classList.add("is-open");
    historyPanel.setAttribute("aria-hidden", "false");
    historyPanelAgent.textContent = agent.name;
    loadFullHistory();
  }

  function closeHistoryPanel() {
    if (!historyPanel) return;
    historyPanel.classList.remove("is-open");
    historyPanel.setAttribute("aria-hidden", "true");
    state.historyPanelAgentId = null;
  }

  function scheduleFullHistoryLoad() {
    window.clearTimeout(state.historyPanelDebounce);
    state.historyPanelDebounce = window.setTimeout(loadFullHistory, 160);
  }

  function loadFullHistory() {
    if (!state.historyPanelAgentId || !historyPanelList) return;

    const requestId = ++state.historyPanelRequest;
    const params = new URLSearchParams({
      agentId: state.historyPanelAgentId,
      limit: "120"
    });
    if (historySearch?.value.trim()) params.set("q", historySearch.value.trim());
    if (historySource?.value) params.set("source", historySource.value);
    if (historyDate?.value) params.set("date", historyDate.value);

    historyPanelList.textContent = "加载中...";
    window
      .fetch(`/api/history/full?${params.toString()}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (requestId !== state.historyPanelRequest) return;
        renderFullHistory(payload?.messages || []);
      })
      .catch(() => {
        if (requestId !== state.historyPanelRequest) return;
        historyPanelList.textContent = "历史读取失败";
      });
  }

  function renderFullHistory(messages) {
    if (!historyPanelList) return;
    historyPanelList.replaceChildren();

    if (!messages.length) {
      const empty = document.createElement("p");
      empty.className = "history-panel__empty";
      empty.textContent = "没有匹配的历史";
      historyPanelList.appendChild(empty);
      return;
    }

    for (const message of messages) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "history-panel__item";
      item.innerHTML = `
        <span class="history-panel__meta"></span>
        <span class="history-panel__text"></span>
      `;
      item.querySelector(".history-panel__meta").textContent = `${formatTime(message.timestamp)} 路 ${message.source || "wsl"}`;
      item.querySelector(".history-panel__text").textContent = message.text;
      item.addEventListener("pointerdown", (event) => event.stopPropagation());
      item.addEventListener("click", () => showHistoryMessage(message));
      historyPanelList.appendChild(item);
    }
  }

  function showHistoryMessage(message) {
    closeReplyComposer();
    if (state.activeBubble) {
      finishBubbleStream(state.activeBubble);
      state.activeBubble.element.remove();
      state.activeBubble = null;
      state.focusedId = null;
      state.transitioning = false;
    }
    state.pendingMessages.push({
      ...message,
      id: `history-${Date.now()}-${Math.random().toString(16).slice(2)}`
    });
    showNextMessage();
  }

  function enforceBubbleLimit() {
    const expanded = state.bubbles
      .filter((bubble) => !bubble.minimized)
      .sort((a, b) => a.createdAt - b.createdAt);

    while (expanded.length > maxExpandedBubbles) {
      const oldest = expanded.shift();
      minimizeBubble(oldest.id);
    }
  }

  function newestExpandedBubble() {
    return state.bubbles
      .filter((bubble) => !bubble.minimized)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  }

  function setActiveAgent(agentId) {
    for (const dot of agentDots) {
      const agent = agentById.get(dot.dataset.agent);
      dot.style.setProperty("--agent-color", agent ? agent.color : "#43f7ff");
      if (agent) dot.style.setProperty("--agent-avatar", `url("${agent.avatar}")`);
      dot.classList.toggle("is-active", dot.dataset.agent === agentId);
      dot.classList.toggle("is-typing", state.typingAgents.has(dot.dataset.agent));
      dot.setAttribute("aria-busy", state.typingAgents.has(dot.dataset.agent) ? "true" : "false");
    }
  }

  function setTypingAgent(agentId) {
    window.clearTimeout(state.typingClearTimers.get(agentId));
    state.typingClearTimers.delete(agentId);
    state.typingAgents.add(agentId);
    state.typingStartedAt.set(agentId, Date.now());
    syncTypingAgentDots();
    syncThinkingAgentFromTyping();
  }

  function clearTypingAgent(agentId, options = {}) {
    if (options.immediate) {
      finishClearTypingAgent(agentId);
      return;
    }
    const startedAt = state.typingStartedAt.get(agentId) || 0;
    const wait = Math.max(0, minTypingVisibleMs - (Date.now() - startedAt));
    if (wait > 0) {
      window.clearTimeout(state.typingClearTimers.get(agentId));
      state.typingClearTimers.set(agentId, window.setTimeout(() => finishClearTypingAgent(agentId), wait));
      return;
    }
    finishClearTypingAgent(agentId);
  }

  function finishClearTypingAgent(agentId) {
    window.clearTimeout(state.typingClearTimers.get(agentId));
    state.typingClearTimers.delete(agentId);
    state.typingStartedAt.delete(agentId);
    if (!state.typingAgents.delete(agentId)) return;
    syncTypingAgentDots();
    syncThinkingAgentFromTyping();
  }

  function syncTypingAgentDots() {
    for (const dot of agentDots) {
      const typing = state.typingAgents.has(dot.dataset.agent);
      dot.classList.toggle("is-typing", typing);
      dot.setAttribute("aria-busy", typing ? "true" : "false");
    }
  }

  function syncThinkingAgentFromTyping() {
    if (!lightPillarHost) return;
    let hasThinkingAgent = false;
    for (const agent of agents) {
      const isTyping = state.typingAgents.has(agent.id);
      lightPillarHost.classList.toggle(`is-thinking-${agent.id}`, isTyping);
      if (isTyping) hasThinkingAgent = true;
    }
    lightPillarHost.classList.toggle("is-thinking", hasThinkingAgent);
  }

  function flashAgentClick(agentId) {
    if (state.typingAgents.has(agentId)) return;
    const dot = agentDots.find((item) => item.dataset.agent === agentId);
    if (!dot) return;

    window.clearTimeout(state.clickFlashTimers.get(agentId));
    state.clickFlashTimers.delete(agentId);
    dot.classList.remove("is-flashing");
    void dot.offsetWidth;
    dot.classList.add("is-flashing");
    state.clickFlashTimers.set(
      agentId,
      window.setTimeout(() => {
        dot.classList.remove("is-flashing");
        state.clickFlashTimers.delete(agentId);
      }, 680)
    );
  }

  function selectCurrentOrNextAgentComposer() {
    const currentId = state.replyOpen && state.composerAgentId
      ? state.composerAgentId
      : agentDots.find((dot) => dot.classList.contains("is-active"))?.dataset.agent;
    const currentIndex = agents.findIndex((agent) => agent.id === currentId);
    const nextIndex = state.replyOpen && currentIndex >= 0 ? (currentIndex + 1) % agents.length : Math.max(currentIndex, 0);
    const nextAgent = agents[nextIndex];

    if (state.activeBubble && !state.transitioning) {
      if (state.replyOpen) closeReplyComposer({ keepTyping: true });
      dismissActiveBubble({
        afterReply: true,
        onFinish: () => openAgentComposer(nextAgent.id)
      });
      return;
    }

    openAgentComposer(nextAgent.id);
  }

  function handleGlobalKeydown(event) {
    if (event.key === "Escape" && state.cronInboxOpen) {
      event.preventDefault();
      setCronInboxOpen(false);
      return;
    }

    if (event.key === "Escape" && historyPanel?.classList.contains("is-open")) {
      event.preventDefault();
      closeHistoryPanel();
      return;
    }

    const isTab = event.code === "Tab" || event.key === "Tab";
    if (!isTab) return;

    event.preventDefault();
    selectCurrentOrNextAgentComposer();
  }

  function unlockAudio() {
    const context = getAudioContext();
    if (!context) return;

    const finishUnlock = () => {
      state.audioUnlocked = context.state === "running";
      if (state.audioUnlocked) flushQueuedSound();
    };

    if (context.state === "running") {
      finishUnlock();
      return;
    }

    tryPrimeAudioContext(context);
    const resumeResult = context.resume?.();
    if (resumeResult && typeof resumeResult.then === "function") {
      resumeResult.then(finishUnlock).catch(() => {});
    } else {
      finishUnlock();
    }
  }

  function getAudioContext() {
    if (audioContext) return audioContext;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioContext = new AudioCtor();
    return audioContext;
  }

  function tryPrimeAudioContext(context) {
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.02);
    } catch {
      // Best effort only. Some browsers do not allow priming until resume settles.
    }
  }

  function queueMessageSound(agent) {
    state.pendingSoundAgentId = agent?.id || agents[0].id;
  }

  function flushQueuedSound() {
    if (state.pendingStartupSound) {
      const shouldPlayStartupSound = Date.now() <= state.pendingStartupSoundUntil;
      state.pendingStartupSound = false;
      state.pendingStartupSoundUntil = 0;
      if (shouldPlayStartupSound) playStartupEntranceSound({ allowQueue: false });
    }

    if (!state.pendingSoundAgentId) return;
    const agent = agentById.get(state.pendingSoundAgentId) || agents[0];
    state.pendingSoundAgentId = null;
    playMessageSound(agent, { allowQueue: false });
  }

  function playStartupEntranceSound(options = {}) {
    const context = getAudioContext();
    if (!context) return;
    const allowQueue = options.allowQueue !== false;

    if (context.state !== "running") {
      if (allowQueue) {
        state.pendingStartupSound = true;
        state.pendingStartupSoundUntil = Date.now() + startupSoundQueueWindowMs;
      }
      const resumeResult = context.resume?.();
      if (resumeResult && typeof resumeResult.then === "function") {
        resumeResult.then(() => {
          state.audioUnlocked = context.state === "running";
          if (state.audioUnlocked) flushQueuedSound();
        }).catch(() => {});
      }
      return;
    }

    state.audioUnlocked = true;
    state.pendingStartupSound = false;
    state.pendingStartupSoundUntil = 0;

    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.13, now + 0.028);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.92);
    master.connect(context.destination);

    const steps = [
      { at: 0, from: 92, to: 132, duration: 0.11, gain: 0.045, type: "sawtooth" },
      { at: 0.16, from: 124, to: 86, duration: 0.1, gain: 0.04, type: "square" },
      { at: 0.32, from: 144, to: 104, duration: 0.12, gain: 0.04, type: "sawtooth" },
      { at: 0.48, from: 84, to: 172, duration: 0.14, gain: 0.035, type: "triangle" },
      { at: 0.68, from: 240, to: 184, duration: 0.055, gain: 0.026, type: "square" },
      { at: 0.78, from: 172, to: 112, duration: 0.07, gain: 0.03, type: "square" }
    ];

    for (const step of steps) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + step.at;
      oscillator.type = step.type;
      oscillator.frequency.setValueAtTime(step.from, start);
      oscillator.frequency.exponentialRampToValueAtTime(step.to, start + step.duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(step.gain, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + step.duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + step.duration + 0.02);
    }

    playMechanicalNoiseBurst(context, master, now + 0.04, 0.08, 0.018);
    playMechanicalNoiseBurst(context, master, now + 0.36, 0.075, 0.016);
    playMechanicalNoiseBurst(context, master, now + 0.78, 0.055, 0.014);
  }

  function playMechanicalNoiseBurst(context, destination, start, duration, gainValue) {
    try {
      const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < sampleCount; index += 1) {
        const fade = 1 - index / sampleCount;
        data[index] = (Math.random() * 2 - 1) * fade;
      }

      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1250, start);
      filter.Q.setValueAtTime(7, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      source.start(start);
      source.stop(start + duration + 0.02);
    } catch {
      // The oscillator cue is enough if a browser rejects generated noise buffers.
    }
  }

  function playMessageSound(agent, options = {}) {
    const context = getAudioContext();
    if (!context) return;
    const allowQueue = options.allowQueue !== false;

    if (context.state !== "running") {
      if (allowQueue) queueMessageSound(agent);
      const resumeResult = context.resume?.();
      if (resumeResult && typeof resumeResult.then === "function") {
        resumeResult.then(() => {
          state.audioUnlocked = context.state === "running";
          if (state.audioUnlocked) flushQueuedSound();
        }).catch(() => {});
      }
      return;
    }

    state.audioUnlocked = true;

    const now = context.currentTime;
    const frequencies = [740, 990, 1320];
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.045);
      gain.gain.setValueAtTime(0.0001, now + index * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.035, now + index * 0.045 + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.045 + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * 0.045);
      oscillator.stop(now + index * 0.045 + 0.2);
    });
  }

  function startTitleAlert(agentName) {
    if (!document.hidden) return;

    state.titleAlertAgent = agentName || "Hermes";
    state.titleAlertBlink = false;
    window.clearInterval(state.titleAlertTimer);
    document.title = `● ${state.titleAlertAgent} 来消息`;
    state.titleAlertTimer = window.setInterval(() => {
      state.titleAlertBlink = !state.titleAlertBlink;
      document.title = state.titleAlertBlink ? `● ${state.titleAlertAgent} 来消息` : state.baseTitle;
    }, 850);
  }

  function stopTitleAlert() {
    window.clearInterval(state.titleAlertTimer);
    state.titleAlertTimer = 0;
    state.titleAlertAgent = "";
    state.titleAlertBlink = false;
    document.title = state.baseTitle;
  }

  function handleVisibilityChange() {
    if (!document.hidden) stopTitleAlert();
  }

  function formatTime(iso) {
    const date = new Date(iso);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function runWhenIdle(task, timeout = 900) {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(task, { timeout });
      return;
    }
    window.setTimeout(task, Math.min(timeout, 160));
  }

  function handleBackgroundClick(event) {
    if (event.target instanceof Element && event.target.closest(".message-bubble, .message-chip, .hud, .reply-composer, .cron-toast, .history-panel, .cron-inbox")) return;
    if (state.cronInboxOpen) {
      setCronInboxOpen(false);
      return;
    }
    if (historyPanel?.classList.contains("is-open")) {
      closeHistoryPanel();
      return;
    }
    if (state.replyOpen) {
      closeReplyComposer();
      return;
    }
    if (state.activeBubble) dismissActiveBubble();
    else showNextMessage();
  }

  function setQuality(mode) {
    state.quality = mode;
    document.body.dataset.quality = mode;
    resizeViewport();
    updateLightPillar();
  }

  function updateLightPillar() {
    if (!lightPillarHost) return;
    const options = {
      topColor: "#5527ff",
      bottomColor: "#d615d0",
      intensity: 1.6,
      rotationSpeed: 0.8,
      glowAmount: 0.002,
      pillarWidth: 3.5,
      pillarHeight: 0.1,
      noiseIntensity: 0,
      pillarRotation: 42,
      quality: state.quality === "cinematic" ? "high" : state.quality === "fast" ? "low" : "medium"
    };

    lightPillarHost.dataset.quality = state.quality;

    if (!window.HermesLightPillar) {
      if (depthValue) depthValue.textContent = "PILLAR";
      return;
    }

    if (!lightPillar) {
      lightPillar = new window.HermesLightPillar(lightPillarHost, {
        ...options,
        interactive: false,
        mixBlendMode: "screen"
      });
      if (depthValue) depthValue.textContent = "PILLAR";
      return;
    }

    lightPillar.update(options);
    if (depthValue) depthValue.textContent = "PILLAR";
  }

  function runStartupAgentEntrance() {
    if (!agentDots.length) return;

    const orderedDots = startupAgentEntranceOrder
      .map((agentId) => agentDots.find((dot) => dot.dataset.agent === agentId))
      .filter(Boolean);
    if (!orderedDots.length) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) {
      orderedDots.forEach((dot, index) => {
        const agentId = dot.dataset.agent;
        window.setTimeout(() => flashAgentClick(agentId), index * 90);
      });
      return;
    }

    playStartupEntranceSound();

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;

    for (const dot of orderedDots) {
      const rect = dot.getBoundingClientRect();
      const startX = Math.max(160, viewportWidth + 80 - rect.left);
      const startY = -Math.max(88, rect.bottom + 28);
      dot.classList.add("is-startup-entering");
      dot.style.transition = "none";
      dot.style.transform = `translate3d(${startX}px, ${startY}px, 0) scale(0.94)`;
      dot.style.opacity = "0";
    }

    runAfterFirstPaint(() => {
      orderedDots.forEach((dot, index) => {
        const agentId = dot.dataset.agent;
        const delay = index * 160;

        window.setTimeout(() => {
          dot.style.transition = "transform 420ms cubic-bezier(0.18, 0.88, 0.18, 1), opacity 260ms ease";
          dot.style.transform = "translate3d(0, 0, 0) scale(1)";
          dot.style.opacity = "1";
        }, delay);

        window.setTimeout(() => {
          dot.classList.remove("is-startup-entering");
          dot.style.removeProperty("transition");
          dot.style.removeProperty("transform");
          dot.style.removeProperty("opacity");
          flashAgentClick(agentId);
        }, delay + 440);
      });
    });
  }

  function boot() {
    for (const dot of agentDots) {
      const agent = agentById.get(dot.dataset.agent);
      if (agent) {
        dot.style.setProperty("--agent-color", agent.color);
        dot.style.setProperty("--agent-avatar", `url("${agent.avatar}")`);
        dot.tabIndex = 0;
        dot.setAttribute("role", "button");
        dot.setAttribute("aria-label", `Open input for ${agent.name}`);
        dot.addEventListener("click", () => openAgentComposer(agent.id));
        dot.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            openAgentComposer(agent.id);
          }
        });
      }
    }

    runStartupAgentEntrance();
    publishHermesInterface();
    setQuality("fast");

    window.addEventListener("resize", resizeViewport);
    document.addEventListener("pointerdown", unlockAudio, { capture: true });
    document.addEventListener("click", unlockAudio, { capture: true });
    document.addEventListener("keydown", unlockAudio, { capture: true });
    document.addEventListener("pointerdown", handleBackgroundClick);
    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    replyInput.addEventListener("input", updateReplyState);
    replyInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeReplyComposer();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendReply();
      }
    });
    sendReplyButton.addEventListener("click", sendReply);
    historyPanelClose?.addEventListener("click", closeHistoryPanel);
    historySearch?.addEventListener("input", scheduleFullHistoryLoad);
    historySource?.addEventListener("change", loadFullHistory);
    historyDate?.addEventListener("change", loadFullHistory);
    cronInboxToggle?.addEventListener("click", () => setCronInboxOpen(!state.cronInboxOpen));
    cronInboxClose?.addEventListener("click", () => setCronInboxOpen(false));
    window.addEventListener("hermes-lightpillar-ready", updateLightPillar);

    renderDrawer();
    renderCronInbox();
    connectHermesBridge();
    runWhenIdle(() => {
      loadHistoryFromServer();
      loadCronHistoryFromServer();
    });
    if (shouldRunDemoMessages()) startDemoMessages();
  }

  boot();
})();
