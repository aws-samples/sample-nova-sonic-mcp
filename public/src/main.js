import { AudioPlayer } from "./lib/play/AudioPlayer.js";
import { ChatHistoryManager } from "./lib/util/ChatHistoryManager.js";

// Connect to the server
const socket = io();

// DOM elements
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const textButton = document.getElementById("text");
const statusElement = document.getElementById("status");
const chatContainer = document.getElementById("chat-container");
const statusTextElement = document.getElementById("status-text");
const pulsatingOrb = document.getElementById("pulsating-orb");
const configButton = document.getElementById("config-button");
const configModal = document.getElementById("config-modal");
const closeModalBtn = document.querySelector(".close-modal");
const promptSelect = document.getElementById("prompt-select");
const promptEditor = document.getElementById("prompt-editor");
const saveConfigBtn = document.getElementById("save-config");
const cancelConfigBtn = document.getElementById("cancel-config");

// Chat history management
let chat = { history: [] };
const chatRef = { current: chat };
const chatHistoryManager = ChatHistoryManager.getInstance(
  chatRef,
  (newChat) => {
    chat = { ...newChat };
    chatRef.current = chat;
    updateChatUI();
  }
);

// Audio processing variables
let audioContext;
let audioStream;
let isStreaming = false;
let isMuted = true; // 默认麦克风是关闭状态
let isChatVisible = true; // 对话可见状态变量
let processor;
let sourceNode;
let analyser; // 音频分析器
let audioDataArray; // 存储音频数据
let animationFrame; // 动画帧
let lastAudioTimestamp = 0; // 上次音频数据时间戳
let voiceActivityHistory = []; // 存储语音活动历史
let voiceFrequencyHistory = []; // 存储语音频率特征历史

// 平滑过渡参数
let currentScale = 1.0; // 当前缩放比例
let currentHue = 190; // 当前色调
let currentSaturation = 80; // 当前饱和度
let currentLightness = 55; // 当前亮度
let currentGlow = 70; // 当前发光强度
let currentOpacity = 0.8; // 当前不透明度
let currentInnerGlowOpacity = 0.3; // 内部光晕不透明度
let targetValues = {}; // 目标值存储
let smoothingFactor = 0.15; // 平滑因子 (0-1), 值越小过渡越平滑
let waitingForAssistantResponse = false;
let waitingForUserTranscription = false;
let userThinkingIndicator = null;
let assistantThinkingIndicator = null;
let transcriptionReceived = false;
let displayAssistantText = false;
let role;
let audioPlayer = new AudioPlayer();
let sessionInitialized = false;
let micPermissionError = false;
let promptCache = {}; // 存储提示词缓存

// Custom system prompt - you can modify this
let SYSTEM_PROMPT =
  "You are a friend. The user and you will engage in a spoken " +
  "dialog exchanging the transcripts of a natural real-time conversation. Keep your responses short, " +
  "generally two or three sentences for chatty scenarios.You have access to a set of tools. You can use one tool per message, and will receive the result of that tool use in the user's response. You use tools step-by-step to accomplish a given task, with each tool use informed by the result of the previous tool use.";

// 当前声音配置
let currentVoiceId = "tiffany"; // 默认使用tiffany声音
let currentVoiceDisplay = "tiffany"; // 默认显示名称

// 当前语言配置
let currentLanguage = "zh"; // 默认使用中文

// 多语言文本对象
const translations = {
  zh: {
    // 配置弹窗
    config: "配置",
    prompt: "提示词",
    language: "语言",
    mcpServers: "MCP服务器",
    selectPrompt: "选择提示词:",
    customPrompt: "自定义提示词:",
    selectLanguage: "选择语言:",
    save: "保存",
    cancel: "取消",
    loading: "加载中...",
    configSaved: "配置已保存",

    // 状态文本
    disconnected: "已断开连接",
    connected: "已连接到服务器",
    requestingMic: "正在请求麦克风权限...",
    micReady: "麦克风已准备就绪",
    recording: "正在录音中...",
    processing: "处理中...",
    ready: "已准备就绪",
    initSession: "初始化会话中...",
    sessionInited: "会话初始化成功",
    sessionError: "会话初始化错误",
    talkOrTap: "说话或点击打断",
    micPermError: "麦克风权限错误：",
    micPermDenied: "麦克风权限被拒绝。请在浏览器设置中允许麦克风访问。",
    refreshing: "正在刷新页面...",
    voiceSwitched: "已切换到{voice}声音",

    // 聊天界面
    startChat: "点击下方电话按钮，开始对话",
    conversationEnded: "对话已结束",

    // MCP服务器
    enabled: "已启用",
    disabled: "已禁用",
    command: "命令:",
    args: "参数:",
    availableTools: "可用工具",
    noTools: "该服务器未提供工具",
    noServers: "未配置MCP服务器",
    failedToLoad: "获取MCP服务器信息失败",
    loadError: "加载MCP服务器信息时出错",
  },
  en: {
    // Config dialog
    config: "Configuration",
    prompt: "Prompt",
    language: "Language",
    mcpServers: "MCP Servers",
    selectPrompt: "Select Prompt:",
    customPrompt: "Custom Prompt:",
    selectLanguage: "Select Language:",
    save: "Save",
    cancel: "Cancel",
    loading: "Loading...",
    configSaved: "Configuration Saved",

    // Status texts
    disconnected: "Disconnected",
    connected: "Connected to server",
    requestingMic: "Requesting microphone permission...",
    micReady: "Microphone ready",
    recording: "Recording...",
    processing: "Processing...",
    ready: "Ready",
    initSession: "Initializing session...",
    sessionInited: "Session initialized",
    sessionError: "Session initialization error",
    talkOrTap: "Talk or tap to interrupt",
    micPermError: "Microphone permission error: ",
    micPermDenied:
      "Microphone permission denied. Please enable microphone access in browser settings.",
    refreshing: "Refreshing page...",
    voiceSwitched: "Switched to {voice} voice",

    // Chat interface
    startChat: "Click phone button below to start conversation",
    conversationEnded: "Conversation ended",

    // MCP servers
    enabled: "Enabled",
    disabled: "Disabled",
    command: "Command:",
    args: "Arguments:",
    availableTools: "Available Tools",
    noTools: "No tools provided by this server",
    noServers: "No MCP servers configured",
    failedToLoad: "Failed to load MCP server information",
    loadError: "Error loading MCP server information",
  },
};

// 初始化用户头部下拉菜单
function initVoiceDropdown() {
  const userBox = document.getElementById("user-box");
  const voiceDropdown = document.getElementById("voice-dropdown");
  const voiceOptions = document.querySelectorAll(".voice-option");
  const currentVoiceElement = document.getElementById("current-voice");

  // 更新所有标记为selected的选项
  function updateSelectedVoice(voiceId) {
    voiceOptions.forEach((opt) => {
      if (opt.getAttribute("data-voice") === voiceId) {
        opt.classList.add("selected");
      } else {
        opt.classList.remove("selected");
      }
    });
  }

  // 初始化选中状态
  updateSelectedVoice(currentVoiceId);

  // 点击用户框显示下拉菜单
  userBox.addEventListener("click", (e) => {
    e.stopPropagation();
    voiceDropdown.classList.toggle("show");
  });

  // 选择声音选项
  voiceOptions.forEach((option) => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      const voiceId = option.getAttribute("data-voice");
      const voiceName = option.querySelector(".voice-name").textContent;

      // 设置当前声音ID和显示名称
      currentVoiceId = voiceId;

      if (voiceId === "tiffany") {
        currentVoiceDisplay = "tiffany";
      } else if (voiceId === "matthew") {
        currentVoiceDisplay = "matthew";
      } else if (voiceId === "amy") {
        currentVoiceDisplay = "amy";
      }

      // 更新显示名称
      currentVoiceElement.textContent = currentVoiceDisplay;

      // 更新选中状态
      updateSelectedVoice(voiceId);

      // 关闭下拉菜单
      voiceDropdown.classList.remove("show");

      // 发送语音配置到服务器
      socket.emit("voiceConfig", { voiceId: currentVoiceId });

      // 重置会话，下次对话时使用新的声音
      sessionInitialized = false;

      // 显示提示信息
      statusElement.textContent = `已切换到${currentVoiceDisplay}声音`;
      statusElement.className = "connected";
      setTimeout(() => {
        if (statusElement.textContent.includes("已切换")) {
          statusElement.textContent = isStreaming
            ? "正在录音中..."
            : "已准备就绪";
          statusElement.className = isStreaming ? "recording" : "ready";
        }
      }, 2000);
    });
  });

  // 点击其他地方关闭下拉菜单
  document.addEventListener("click", () => {
    voiceDropdown.classList.remove("show");
  });
}

// 获取当前语言的翻译文本
function getText(key, substitutions = {}) {
  const lang = translations[currentLanguage] || translations.zh; // 默认使用中文
  let text = lang[key] || key; // 如果找不到翻译，则使用键名

  // 处理替换值
  Object.keys(substitutions).forEach((subKey) => {
    text = text.replace(`{${subKey}}`, substitutions[subKey]);
  });

  return text;
}

// 更新UI文本
function updateUITexts() {
  // 更新配置弹窗文本
  document.querySelector(".modal-header h2").textContent = getText("config");
  document.querySelector(".tab[data-tab='prompt']").textContent =
    getText("prompt");
  document.querySelector(".tab[data-tab='language']").textContent =
    getText("language");
  document.querySelector(".tab[data-tab='mcp-servers']").textContent =
    getText("mcpServers");
  document.querySelector("label[for='prompt-select']").textContent =
    getText("selectPrompt");
  document.querySelector("label[for='prompt-editor']").textContent =
    getText("customPrompt");
  document.querySelector("label[for='language-select']").textContent =
    getText("selectLanguage");
  document.querySelector("#save-config").textContent = getText("save");
  document.querySelector("#cancel-config").textContent = getText("cancel");

  // 更新加载文本
  const mcpLoading = document.querySelector("#mcp-servers-container p");
  if (mcpLoading && mcpLoading.textContent.includes("加载中")) {
    mcpLoading.textContent = getText("loading");
  }

  // 更新状态文本
  if (statusElement) {
    const currentStatus = statusElement.textContent;

    if (currentStatus.includes("已断开连接")) {
      statusElement.textContent = getText("disconnected");
    } else if (currentStatus.includes("已连接到服务器")) {
      statusElement.textContent = getText("connected");
    } else if (currentStatus.includes("正在请求麦克风权限")) {
      statusElement.textContent = getText("requestingMic");
    } else if (currentStatus.includes("麦克风已准备就绪")) {
      statusElement.textContent = getText("micReady");
    } else if (currentStatus.includes("正在录音中")) {
      statusElement.textContent = getText("recording");
    } else if (currentStatus.includes("处理中")) {
      statusElement.textContent = getText("processing");
    } else if (currentStatus.includes("已准备就绪")) {
      statusElement.textContent = getText("ready");
    } else if (currentStatus.includes("初始化会话中")) {
      statusElement.textContent = getText("initSession");
    } else if (currentStatus.includes("会话初始化成功")) {
      statusElement.textContent = getText("sessionInited");
    } else if (currentStatus.includes("会话初始化错误")) {
      statusElement.textContent = getText("sessionError");
    } else if (currentStatus.includes("已切换到")) {
      statusElement.textContent = getText("voiceSwitched", {
        voice: currentVoiceDisplay,
      });
    } else if (currentStatus.includes("配置已保存")) {
      statusElement.textContent = getText("configSaved");
    }
  }

  // 更新状态说明文本
  if (
    statusTextElement &&
    statusTextElement.textContent.includes("说话或点击打断")
  ) {
    statusTextElement.textContent = getText("talkOrTap");
  }

  // 更新空聊天文本
  const emptyChat = document.querySelector("#empty-chat-subtitle");
  if (emptyChat) {
    emptyChat.textContent = getText("startChat");
  }

  // 检查是否有对话结束提示
  const systemMessages = document.querySelectorAll(".message.system");
  systemMessages.forEach((msg) => {
    if (msg.textContent.includes("对话已结束")) {
      msg.textContent = getText("conversationEnded");
    }
  });
}

// 语言选择功能
function initLanguageSelect() {
  const languageSelect = document.getElementById("language-select");
  if (languageSelect) {
    // 设置初始选中的语言
    languageSelect.value = currentLanguage;

    // 添加变更事件以预览语言效果
    languageSelect.addEventListener("change", () => {
      const selectedLanguage = languageSelect.value;
      // 临时切换语言以预览效果
      const originalLanguage = currentLanguage;
      currentLanguage = selectedLanguage;
      updateUITexts();

      // 如果用户没有保存，则在关闭弹窗时恢复原来的语言
      document.getElementById("cancel-config").addEventListener(
        "click",
        function onCancel() {
          currentLanguage = originalLanguage;
          updateUITexts();
          this.removeEventListener("click", onCancel);
        },
        { once: true }
      );
    });
  }
}

// 初始化配置弹窗
function initConfigModal() {
  // 获取标签页元素
  const tabs = document.querySelectorAll(".modal-tabs .tab");
  const tabContents = document.querySelectorAll(".tab-content");

  // 显示配置弹窗
  configButton.addEventListener("click", () => {
    configModal.classList.add("show");
    loadPromptOptions();
    loadMcpServers(); // 加载MCP服务器信息
    updateUITexts(); // 更新UI文本
    initLanguageSelect(); // 初始化语言选择
  });

  // 关闭配置弹窗
  closeModalBtn.addEventListener("click", () => {
    configModal.classList.remove("show");
  });

  // 取消按钮
  cancelConfigBtn.addEventListener("click", () => {
    configModal.classList.remove("show");
  });

  // 标签页切换功能
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabId = tab.getAttribute("data-tab");

      // 更新活动标签
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // 更新标签内容
      tabContents.forEach((content) => {
        content.classList.remove("active");
        if (content.id === `${tabId}-tab`) {
          content.classList.add("active");
        }
      });
    });
  });

  // 保存配置
  saveConfigBtn.addEventListener("click", () => {
    const selectedPrompt = promptSelect.value;
    const selectedLanguage = document.getElementById("language-select").value;

    // 保存提示词配置
    if (selectedPrompt === "custom") {
      // 使用自定义提示词
      SYSTEM_PROMPT = promptEditor.value.trim();
    } else if (promptCache[selectedPrompt]) {
      // 使用预设提示词
      SYSTEM_PROMPT = promptCache[selectedPrompt];
    }

    // 保存语言配置
    if (selectedLanguage !== currentLanguage) {
      currentLanguage = selectedLanguage;
      updateUITexts(); // 立即更新UI文本
    }

    // 重置会话以使用新提示词
    sessionInitialized = false;

    // 关闭弹窗
    configModal.classList.remove("show");

    // 显示通知
    statusElement.textContent = "配置已保存";
    statusElement.className = "connected";
    setTimeout(() => {
      if (statusElement.textContent === "配置已保存") {
        statusElement.textContent = isStreaming
          ? "正在录音中..."
          : "已准备就绪";
        statusElement.className = isStreaming ? "recording" : "ready";
      }
    }, 2000);
  });

  // 选择提示词类型变化时
  promptSelect.addEventListener("change", async () => {
    const selectedPrompt = promptSelect.value;

    if (selectedPrompt === "custom") {
      // 自定义模式，显示当前系统提示词
      promptEditor.value = SYSTEM_PROMPT;
      promptEditor.disabled = false;
    } else {
      // 预设模式，加载对应提示词
      promptEditor.disabled = true;

      // 如果提示词已缓存，直接使用
      if (promptCache[selectedPrompt]) {
        promptEditor.value = promptCache[selectedPrompt];
      } else {
        // 否则加载提示词文件
        try {
          promptEditor.value = "加载中...";
          const response = await fetch(`/prompts/${selectedPrompt}.md`);
          if (response.ok) {
            const text = await response.text();
            promptCache[selectedPrompt] = text;
            promptEditor.value = text;
          } else {
            promptEditor.value = "加载失败";
          }
        } catch (error) {
          console.error("加载提示词失败:", error);
          promptEditor.value = "加载失败";
        }
      }
    }
  });
}

// 加载提示词选项
async function loadPromptOptions() {
  // 设置当前选项为自定义
  let customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "自定义";
  promptSelect.appendChild(customOption);

  // 选择自定义选项并加载当前提示词
  promptSelect.value = "custom";
  promptEditor.value = SYSTEM_PROMPT;
  promptEditor.disabled = false;
}

// Initialize WebSocket audio
// 如果聊天为空，显示空聊天消息
function checkEmptyChat() {
  if (
    !chat.history.length &&
    !waitingForUserTranscription &&
    !waitingForAssistantResponse
  ) {
    chatContainer.innerHTML = `
            <div id="empty-chat">
                <div id="empty-chat-subtitle">点击下方电话按钮，开始对话</div>
            </div>
        `;
    return true;
  }
  return false;
}

// 初始化音频分析器和动画
function setupAudioVisualization() {
  if (!audioContext || !sourceNode) return;

  // 创建音频分析器
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.8;

  // 连接分析器
  sourceNode.connect(analyser);

  // 创建数据数组
  const bufferLength = analyser.frequencyBinCount;
  audioDataArray = new Uint8Array(bufferLength);

  // 启动动画循环
  updateOrbAnimation();
}

// 更新脉动球体动画
function updateOrbAnimation() {
  if (!analyser || !isStreaming) {
    cancelAnimationFrame(animationFrame);
    return;
  }

  // 获取频率数据和时域数据
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(frequencyData);
  analyser.getByteTimeDomainData(timeData);

  // 将当前音频数据保存到音频数据数组中
  audioDataArray = frequencyData;

  // 计算平均振幅和分析不同频率段
  let sum = 0;
  let bassSum = 0;
  let midSum = 0;
  let trebleSum = 0;

  // 分析不同频率段的能量
  const bassRange = Math.floor(frequencyData.length * 0.3); // 低频
  const midRange = Math.floor(frequencyData.length * 0.6); // 中频

  // 计算过零率（语音活动检测的指标）
  let zeroCrossings = 0;
  let prevSample = timeData[0] < 128 ? -1 : 1;

  for (let i = 1; i < timeData.length; i++) {
    const currentSample = timeData[i] < 128 ? -1 : 1;
    if (prevSample !== currentSample) {
      zeroCrossings++;
    }
    prevSample = currentSample;
  }

  // 存储语音活动历史
  const now = Date.now();
  if (now - lastAudioTimestamp > 50) {
    // 每50ms采样一次
    const voiceActivityScore = (zeroCrossings / timeData.length) * 1000;

    // 保存最近的语音活动数据，最多保留20个点
    voiceActivityHistory.push(voiceActivityScore);
    if (voiceActivityHistory.length > 20) {
      voiceActivityHistory.shift();
    }

    // 提取频率特征并保存历史
    const frequencyFeature = {
      bass: 0,
      mid: 0,
      treble: 0,
    };

    lastAudioTimestamp = now;
  }

  for (let i = 0; i < frequencyData.length; i++) {
    sum += frequencyData[i];

    // 按频率范围分析
    if (i < bassRange) {
      bassSum += frequencyData[i];
    } else if (i < midRange) {
      midSum += frequencyData[i];
    } else {
      trebleSum += frequencyData[i];
    }
  }

  const average = sum / frequencyData.length;
  const bassAvg = bassSum / bassRange;
  const midAvg = midSum / (midRange - bassRange);
  const trebleAvg = trebleSum / (frequencyData.length - midRange);

  // 计算语音活动水平
  const voiceActivityLevel = Math.min(
    1.0,
    zeroCrossings / (timeData.length * 0.15)
  );

  // 非线性映射让微弱的声音也能有明显变化
  const volumeFactor = Math.pow(average / 128, 0.5);

  // 动态缩放因子结合了音量和语音活动
  const dynamicScaleFactor = Math.max(
    volumeFactor,
    voiceActivityLevel * 0.7 + Math.sin(Date.now() / 200) * 0.05
  );

  // 根据音量和频率调整球体脉动
  const scale = 1 + Math.min(0.5, dynamicScaleFactor * 0.7);
  const opacity = 0.8 + (average / 256) * 0.2;

  // 根据不同频段能量调整发光效果
  const bassIntensity = Math.min(1.0, bassAvg / 110);
  const midIntensity = Math.min(1.0, midAvg / 90);
  const trebleIntensity = Math.min(1.0, trebleAvg / 70);

  // 声音特征分析
  const soundEnergy =
    bassIntensity * 0.5 + midIntensity * 0.3 + trebleIntensity * 0.2;
  const isPulsating = soundEnergy > 0.2 || voiceActivityLevel > 0.3;

  // 更加动态的光晕效果
  const baseGlow = 60;
  const glow =
    baseGlow + Math.min(120, average * 1.0 + voiceActivityLevel * 60);

  // 根据语音活动和频率特征动态变化颜色
  let r, g, b;

  // 如果有清晰的语音活动
  if (voiceActivityLevel > 0.3) {
    // 蓝色偏紫的色调 - 更富有活力的语音颜色
    r = Math.floor(50 + trebleIntensity * 100 + bassIntensity * 50);
    g = Math.floor(80 + midIntensity * 90);
    b = Math.floor(200 + voiceActivityLevel * 55);
  } else {
    // 蓝绿色调 - 默认状态或背景噪音
    r = Math.floor(30 + bassIntensity * 100);
    g = Math.floor(150 + midIntensity * 60);
    b = Math.floor(220 + trebleIntensity * 35);
  }

  // 应用脉动效果
  let transformStyle = `scale(${scale})`;

  // 添加微小的随机移动，使球体看起来更有生命力
  if (isPulsating) {
    const offsetX = (Math.random() - 0.5) * 5 * voiceActivityLevel;
    const offsetY = (Math.random() - 0.5) * 5 * voiceActivityLevel;
    transformStyle += ` translate(${offsetX}px, ${offsetY}px)`;
  }

  pulsatingOrb.style.transform = transformStyle;
  pulsatingOrb.style.opacity = opacity;

  // 更动态的阴影效果和内部光晕
  pulsatingOrb.style.boxShadow = `
    0 0 ${glow}px rgba(${r}, ${g}, ${b}, ${0.6 + voiceActivityLevel * 0.2}), 
    0 0 ${glow * 1.5}px rgba(${r}, ${g}, ${b}, ${0.3 + soundEnergy * 0.2}), 
    inset 0 0 ${
      40 + average * 0.6 + voiceActivityLevel * 30
    }px rgba(255, 255, 255, ${
    0.4 + trebleIntensity * 0.3 + voiceActivityLevel * 0.3
  })
  `;

  // 动态更改球体内部渐变
  if (average > 30 || voiceActivityLevel > 0.2) {
    pulsatingOrb.style.background = `radial-gradient(
      circle, 
      rgba(${r + 50}, ${g + 30}, ${b + 20}, ${
      0.7 + voiceActivityLevel * 0.3
    }) 0%,
      rgba(${r}, ${g}, ${b}, ${0.6 + soundEnergy * 0.2}) 60%,
      rgba(${r - 30}, ${g - 20}, ${b - 10}, ${0.5 + bassIntensity * 0.2}) 100%
    )`;
  }

  // 继续循环
  animationFrame = requestAnimationFrame(updateOrbAnimation);
}

// 停止音频可视化动画
function stopAudioVisualization() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  // 重置球体样式
  if (pulsatingOrb) {
    pulsatingOrb.style.transform = "";
    pulsatingOrb.style.opacity = "";
    pulsatingOrb.style.boxShadow = "";
  }
}

async function initAudio() {
  try {
    statusElement.textContent = "正在请求麦克风权限...";
    statusElement.className = "connecting";

    // Request microphone access
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    audioContext = new AudioContext({
      sampleRate: 16000,
    });

    await audioPlayer.start();

    statusElement.textContent = "麦克风已准备就绪";
    statusElement.className = "ready";
    startButton.disabled = false;
    stopButton.disabled = false; // 允许点击电话按钮开始对话
    micPermissionError = false;

    // 设置麦克风和电话按钮的初始样式
    startButton.style.backgroundColor = "#ff3b30"; // 红色，表示麦克风关闭
    startButton.querySelector("i").textContent = "mic_off";
    stopButton.style.backgroundColor = "#4cd964";
    stopButton.querySelector("i").textContent = "call";

    // 确保麦克风初始状态是关闭的
    if (audioStream) {
      audioStream.getAudioTracks().forEach((track) => {
        track.enabled = false; // 关闭麦克风
      });
    }
  } catch (error) {
    console.error("Error accessing microphone:", error);
    statusElement.textContent = "麦克风权限错误：" + error.message;
    statusElement.className = "error";
    micPermissionError = true;
  }

  // 初始显示空聊天状态
  checkEmptyChat();
}

// Initialize the session with Bedrock
async function initializeSession() {
  if (sessionInitialized) return;

  statusElement.textContent = "初始化会话中...";

  try {
    // Send events in sequence
    socket.emit("promptStart");
    socket.emit("systemPrompt", SYSTEM_PROMPT);
    socket.emit("audioStart");

    // Mark session as initialized
    sessionInitialized = true;
    statusElement.textContent = "会话初始化成功";
  } catch (error) {
    console.error("Failed to initialize session:", error);
    statusElement.textContent = "会话初始化错误";
    statusElement.className = "error";
  }
}

// 处理麦克风静音/取消静音
function toggleMute() {
  if (!audioStream) return;

  isMuted = !isMuted;
  audioStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted;
  });

  // 更新麦克风按钮样式
  startButton.style.backgroundColor = isMuted ? "#ff3b30" : "#4cd964"; // 红色或绿色
  startButton.querySelector("i").textContent = isMuted ? "mic_off" : "mic";
}

// 处理开始/结束对话
function toggleConversation() {
  if (isStreaming) {
    stopStreaming();
    stopButton.style.backgroundColor = "#4cd964"; // 绿色
    stopButton.querySelector("i").textContent = "call";

    // 结束通话后显示正在刷新的状态
    statusElement.textContent = "正在刷新页面...";
    statusElement.className = "processing";

    // 添加一个短暂延迟然后刷新页面
    setTimeout(() => {
      window.location.reload();
    }, 1000); // 1秒后刷新页面，给用户一个视觉反馈的时间
  } else {
    if (micPermissionError) {
      handleRequestPermission();
    } else {
      startStreaming();
      stopButton.style.backgroundColor = "#ff3b30"; // 红色
      stopButton.querySelector("i").textContent = "call_end";

      // 当开始对话时，自动开启麦克风
      if (isMuted) {
        isMuted = false;
        audioStream.getAudioTracks().forEach((track) => {
          track.enabled = true; // 开启麦克风
        });

        // 更新麦克风按钮样式
        startButton.style.backgroundColor = "#4cd964"; // 绿色
        startButton.querySelector("i").textContent = "mic";
      }
    }
  }
}

async function startStreaming() {
  if (isStreaming) return;

  try {
    // 确保AudioPlayer已经初始化
    if (!audioPlayer.initialized) {
      await audioPlayer.start();
    }

    // First, make sure the session is initialized
    if (!sessionInitialized) {
      await initializeSession();
    }

    // Create audio processor
    sourceNode = audioContext.createMediaStreamSource(audioStream);

    // 设置音频分析器和可视化
    setupAudioVisualization();

    // Use ScriptProcessorNode for audio processing
    if (audioContext.createScriptProcessor) {
      processor = audioContext.createScriptProcessor(512, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!isStreaming) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Convert to 16-bit PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
        }

        // Convert to base64 (browser-safe way)
        const base64Data = arrayBufferToBase64(pcmData.buffer);

        // Send to server
        socket.emit("audioInput", base64Data);
      };

      sourceNode.connect(processor);
      processor.connect(audioContext.destination);
    }

    isStreaming = true;
    startButton.disabled = false; // 保持麦克风按钮可用，用于静音
    stopButton.disabled = false;
    statusElement.textContent = "正在录音中...";
    statusElement.className = "recording";
    statusTextElement.textContent = "说话或点击打断";

    // 激活脉动球体
    pulsatingOrb.classList.add("active");

    // Show user thinking indicator when starting to record
    transcriptionReceived = false;
    showUserThinkingIndicator();
  } catch (error) {
    console.error("Error starting recording:", error);
    statusElement.textContent = "错误：" + error.message;
    statusElement.className = "error";
  }
}

// Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer) {
  const binary = [];
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary.push(String.fromCharCode(bytes[i]));
  }
  return btoa(binary.join(""));
}

function stopStreaming() {
  if (!isStreaming) return;

  isStreaming = false;

  // Clean up audio processing
  if (processor) {
    processor.disconnect();
    sourceNode.disconnect();
  }

  // 停止音频可视化
  stopAudioVisualization();

  startButton.disabled = false;
  stopButton.disabled = false; // 保持电话按钮可用，用于重新开始对话
  statusElement.textContent = "处理中...";
  statusElement.className = "processing";
  statusTextElement.textContent = "";

  // 停用脉动球体
  pulsatingOrb.classList.remove("active");

  audioPlayer.stop();
  // Tell server to finalize processing
  socket.emit("stopAudio");

  // End the current turn in chat history
  chatHistoryManager.endTurn();

  // 在停止后创建新的AudioPlayer实例
  audioPlayer = new AudioPlayer();

  // 重置会话状态，这样下一次对话会重新初始化会话
  sessionInitialized = false;

  // 对话结束后，重新关闭麦克风
  isMuted = true;
  if (audioStream) {
    audioStream.getAudioTracks().forEach((track) => {
      track.enabled = false; // 关闭麦克风
    });
  }
  // 更新麦克风按钮样式
  startButton.style.backgroundColor = "#ff3b30"; // 红色
  startButton.querySelector("i").textContent = "mic_off";
}

// Base64 to Float32Array conversion
function base64ToFloat32Array(base64String) {
  try {
    const binaryString = window.atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    return float32Array;
  } catch (error) {
    console.error("Error in base64ToFloat32Array:", error);
    throw error;
  }
}

// Process message data and add to chat history
function handleTextOutput(data) {
  console.log("Processing text output:", data);
  if (data.content) {
    const messageData = {
      role: data.role,
      message: data.content,
    };
    chatHistoryManager.addTextMessage(messageData);
  }
}

// Update the UI based on the current chat history
function updateChatUI() {
  if (!chatContainer) {
    console.error("Chat container not found");
    return;
  }

  // 检查是否为空聊天
  if (checkEmptyChat()) {
    return;
  }

  // Clear existing chat messages
  chatContainer.innerHTML = "";

  // Add all messages from history
  chat.history.forEach((item) => {
    if (item.endOfConversation) {
      const endDiv = document.createElement("div");
      endDiv.className = "message system";
      endDiv.textContent = "对话已结束";
      chatContainer.appendChild(endDiv);
      return;
    }

    if (item.role) {
      const messageDiv = document.createElement("div");
      const roleLowerCase = item.role.toLowerCase();
      messageDiv.className = `message ${roleLowerCase}`;

      const roleLabel = document.createElement("div");
      roleLabel.className = "role-label";
      roleLabel.textContent = item.role;
      messageDiv.appendChild(roleLabel);

      const content = document.createElement("div");
      content.textContent = item.message || "无内容";
      messageDiv.appendChild(content);

      chatContainer.appendChild(messageDiv);
    }
  });

  // Re-add thinking indicators if we're still waiting
  if (waitingForUserTranscription) {
    showUserThinkingIndicator();
  }

  if (waitingForAssistantResponse) {
    showAssistantThinkingIndicator();
  }

  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Show the "Listening" indicator for user
function showUserThinkingIndicator() {
  hideUserThinkingIndicator();

  waitingForUserTranscription = true;
  userThinkingIndicator = document.createElement("div");
  userThinkingIndicator.className = "message user thinking";

  const roleLabel = document.createElement("div");
  roleLabel.className = "role-label";
  roleLabel.textContent = "USER";
  userThinkingIndicator.appendChild(roleLabel);

  const listeningText = document.createElement("div");
  listeningText.className = "thinking-text";
  listeningText.textContent =
    currentLanguage === "en" ? "Listening" : "正在聆听";
  userThinkingIndicator.appendChild(listeningText);

  const dotContainer = document.createElement("div");
  dotContainer.className = "thinking-dots";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "dot";
    dotContainer.appendChild(dot);
  }

  userThinkingIndicator.appendChild(dotContainer);
  chatContainer.appendChild(userThinkingIndicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Show the "Thinking" indicator for assistant
function showAssistantThinkingIndicator() {
  hideAssistantThinkingIndicator();

  waitingForAssistantResponse = true;
  assistantThinkingIndicator = document.createElement("div");
  assistantThinkingIndicator.className = "message assistant thinking";

  const roleLabel = document.createElement("div");
  roleLabel.className = "role-label";
  roleLabel.textContent = "ASSISTANT";
  assistantThinkingIndicator.appendChild(roleLabel);

  const thinkingText = document.createElement("div");
  thinkingText.className = "thinking-text";
  thinkingText.textContent = currentLanguage === "en" ? "Thinking" : "正在思考";
  assistantThinkingIndicator.appendChild(thinkingText);

  const dotContainer = document.createElement("div");
  dotContainer.className = "thinking-dots";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "dot";
    dotContainer.appendChild(dot);
  }

  assistantThinkingIndicator.appendChild(dotContainer);
  chatContainer.appendChild(assistantThinkingIndicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Hide the user thinking indicator
function hideUserThinkingIndicator() {
  waitingForUserTranscription = false;
  if (userThinkingIndicator && userThinkingIndicator.parentNode) {
    userThinkingIndicator.parentNode.removeChild(userThinkingIndicator);
  }
  userThinkingIndicator = null;
}

// Hide the assistant thinking indicator
function hideAssistantThinkingIndicator() {
  waitingForAssistantResponse = false;
  if (assistantThinkingIndicator && assistantThinkingIndicator.parentNode) {
    assistantThinkingIndicator.parentNode.removeChild(
      assistantThinkingIndicator
    );
  }
  assistantThinkingIndicator = null;
}

// EVENT HANDLERS
// --------------

// Handle content start from the server
socket.on("contentStart", (data) => {
  console.log("Content start received:", data);

  if (data.type === "TEXT") {
    // Below update will be enabled when role is moved to the contentStart
    role = data.role;
    if (data.role === "USER") {
      // When user's text content starts, hide user thinking indicator
      hideUserThinkingIndicator();
    } else if (data.role === "ASSISTANT") {
      // When assistant's text content starts, hide assistant thinking indicator
      hideAssistantThinkingIndicator();
      let isSpeculative = false;
      try {
        if (data.additionalModelFields) {
          const additionalFields = JSON.parse(data.additionalModelFields);
          isSpeculative = additionalFields.generationStage === "SPECULATIVE";
          if (isSpeculative) {
            console.log("Received speculative content");
            displayAssistantText = true;
          } else {
            displayAssistantText = false;
          }
        }
      } catch (e) {
        console.error("Error parsing additionalModelFields:", e);
      }
    }
  } else if (data.type === "AUDIO") {
    // When audio content starts, we may need to show user thinking indicator
    if (isStreaming) {
      showUserThinkingIndicator();
    }
  }
});

// Handle text output from the server
socket.on("textOutput", (data) => {
  console.log("Received text output:", data);

  if (role === "USER") {
    // When user text is received, show thinking indicator for assistant response
    transcriptionReceived = true;
    //hideUserThinkingIndicator();

    // Add user message to chat
    handleTextOutput({
      role: data.role,
      content: data.content,
    });

    // Show assistant thinking indicator after user text appears
    showAssistantThinkingIndicator();
  } else if (role === "ASSISTANT") {
    //hideAssistantThinkingIndicator();
    if (displayAssistantText) {
      handleTextOutput({
        role: data.role,
        content: data.content,
      });
    }
  }
});

// 平滑过渡函数：从当前值逐渐过渡到目标值
function smoothTransition(currentVal, targetVal, factor) {
  return currentVal + (targetVal - currentVal) * factor;
}

// Handle audio output
socket.on("audioOutput", (data) => {
  if (data.content) {
    try {
      const audioData = base64ToFloat32Array(data.content);
      audioPlayer.playAudio(audioData);

      // 更新语音历史记录，用于跟踪语音特征变化
      const now = Date.now();
      if (now - lastAudioTimestamp > 30) {
        // 每30ms采样一次
        lastAudioTimestamp = now;

        // 使球体根据AI的音频输出做出更平滑动态的视觉响应
        if (pulsatingOrb) {
          // 计算音频特征
          let sum = 0;
          let peakValue = 0;
          let zeroCrossings = 0;
          let prevSample = 0;
          let energyInBands = [0, 0, 0]; // 低、中、高频段能量
          let segmentLength = Math.floor(audioData.length / 3);

          // 计算更详细的语音特征
          for (let i = 0; i < audioData.length; i++) {
            const absValue = Math.abs(audioData[i]);
            sum += absValue;

            // 寻找峰值
            if (absValue > peakValue) {
              peakValue = absValue;
            }

            // 计算过零率 (判断语音活跃度的重要指标)
            if (
              (audioData[i] >= 0 && prevSample < 0) ||
              (audioData[i] < 0 && prevSample >= 0)
            ) {
              zeroCrossings++;
            }
            prevSample = audioData[i];

            // 将音频分成3段分析不同频率特征（简化模型）
            const bandIndex = Math.min(2, Math.floor(i / segmentLength));
            energyInBands[bandIndex] += absValue;
          }

          // 归一化能量分布
          for (let i = 0; i < energyInBands.length; i++) {
            energyInBands[i] = energyInBands[i] / (segmentLength || 1);
          }

          const average = sum / audioData.length;
          // 增加系数使小音量也有明显效果
          const intensity = Math.min(1.0, average * 15);
          const activityFactor = Math.min(
            1.0,
            (zeroCrossings / audioData.length) * 220
          );

          // 保存特征到历史记录
          if (voiceFrequencyHistory.length > 30) voiceFrequencyHistory.shift();
          voiceFrequencyHistory.push({
            intensity,
            activity: activityFactor,
            peak: peakValue,
            energyBands: [...energyInBands],
            timestamp: now,
          });

          // 目标参数计算 - 基于音频特征但不直接应用
          // 根据语音活动类型调整颜色目标值
          let targetHue, targetSaturation, targetLightness, targetGlow;
          let targetScale =
            1 +
            Math.min(0.5, intensity * 0.35 + Math.sin(Date.now() / 180) * 0.05);

          // 是否为元音(低频能量高)或辅音(高频能量高)
          const isVowelLike = energyInBands[0] > energyInBands[2] * 1.5;
          const isConsonantLike = energyInBands[2] > energyInBands[0] * 1.2;

          if (isVowelLike) {
            // 元音：温暖的色调 (如蓝紫色)
            targetHue = 230 + activityFactor * 30;
            targetSaturation = 75 + intensity * 25;
            targetLightness = 50 + intensity * 30;
          } else if (isConsonantLike) {
            // 辅音：冷色调 (如青色)
            targetHue = 160 + activityFactor * 40;
            targetSaturation = 85 + intensity * 15;
            targetLightness = 45 + intensity * 35;
          } else {
            // 默认或混合音：中性色调
            targetHue = 190 + activityFactor * 45;
            targetSaturation = 80 + intensity * 20;
            targetLightness = 55 + intensity * 25;
          }

          // 基于音频活动的目标发光值
          const baseGlow = 70;
          targetGlow =
            baseGlow + Math.min(120, average * 110 + activityFactor * 60);

          // 目标不透明度
          const targetOpacity = 0.8 + (average / 256) * 0.2;
          const targetInnerGlowOpacity = 0.2 + intensity * 0.5;

          // 动态调整平滑因子 - 快速上升，缓慢下降的效果
          // 对于突然的声音峰值快速响应，但平稳过渡回常态
          const upTransition = 0.3; // 向上过渡速度 (快速响应)
          const downTransition = 0.08; // 向下过渡速度 (缓慢衰减)

          // 根据变化方向选择不同的平滑因子
          let hueSmooth =
            Math.abs(targetHue - currentHue) > 30
              ? upTransition
              : smoothingFactor;
          let scaleSmooth =
            targetScale > currentScale ? upTransition : downTransition;
          let glowSmooth =
            targetGlow > currentGlow ? upTransition : downTransition;

          // 平滑过渡到目标值
          currentHue = smoothTransition(currentHue, targetHue, hueSmooth);
          currentSaturation = smoothTransition(
            currentSaturation,
            targetSaturation,
            smoothingFactor
          );
          currentLightness = smoothTransition(
            currentLightness,
            targetLightness,
            smoothingFactor
          );
          currentGlow = smoothTransition(currentGlow, targetGlow, glowSmooth);
          currentScale = smoothTransition(
            currentScale,
            targetScale,
            scaleSmooth
          );
          currentOpacity = smoothTransition(currentOpacity, targetOpacity, 0.2);
          currentInnerGlowOpacity = smoothTransition(
            currentInnerGlowOpacity,
            targetInnerGlowOpacity,
            0.2
          );

          // 使用平滑过渡后的值应用视觉效果

          // 应用缩放效果 - 无抖动的平滑变换
          let transformStyle = `scale(${currentScale})`;

          // 仅在声音强度较高时添加微小的随机位移，但用平滑值控制强度
          if (intensity > 0.25) {
            // 减小抖动量并使用平方根缩放使其更平滑
            const jitterAmount = Math.sqrt(intensity) * 3;
            // 使用当前时间为种子生成确定性但看似随机的移动
            const t = Date.now() / 1000;
            const offsetX = Math.sin(t * 4.7) * jitterAmount * 0.5;
            const offsetY = Math.cos(t * 5.3) * jitterAmount * 0.5;
            transformStyle += ` translate(${offsetX}px, ${offsetY}px)`;
          }

          pulsatingOrb.style.transform = transformStyle;
          pulsatingOrb.style.opacity = currentOpacity.toString();

          // 波形效果 - 使用平滑过渡的强度
          const voiceWaves = document.querySelector(".voice-waves");
          if (voiceWaves) {
            // 平滑波浪不透明度
            const waveOpacity = Math.min(0.4 + intensity * 0.6, 1.0);
            voiceWaves.style.opacity = waveOpacity.toString();

            // 动态设置波形动画速度 - 基于平滑的值
            const animationDuration = Math.max(1, 3 - intensity * 1.5);

            // 这里CSS选择器可能无法直接工作，考虑使用CSS变量方式控制
            // 添加自定义CSS属性来控制动画
            voiceWaves.style.setProperty(
              "--wave-duration",
              `${animationDuration}s`
            );
          }

          // 声音粒子效果 - 基于平滑的强度值创建粒子
          const voiceParticles = document.querySelector(".voice-particles");
          if (voiceParticles && intensity > 0.15) {
            const particleOpacity = Math.min(0.6 + intensity * 0.4, 1.0);
            voiceParticles.style.opacity = particleOpacity.toString();

            // 根据平滑强度调整粒子创建频率
            // 强度越高，生成粒子的概率越大
            const particleThreshold = 0.7 - intensity * 0.3; // 0.4 - 0.7 范围

            // 创建或更新动态粒子
            if (intensity > 0.25 && Math.random() > particleThreshold) {
              // 粒子大小基于平滑后的值
              const particleSize = 2 + Math.pow(intensity, 0.7) * 6;
              const particle = document.createElement("div");
              particle.className = "dynamic-particle";

              // 粒子的颜色协调与球体的整体色调
              let particleOpacity = 0.7 + intensity * 0.3;
              let particleHue = Math.round(
                currentHue + (Math.random() * 40 - 20)
              );

              // 创建随机路径点，使粒子运动更加自然
              const x1 = (Math.random() - 0.5) * 10;
              const y1 = (Math.random() - 0.5) * 10 - 5;
              const x2 = (Math.random() - 0.5) * 20 - 5;
              const y2 = (Math.random() - 0.5) * 20 - 15;
              const x3 = (Math.random() - 0.5) * 30 - 10;
              const y3 = (Math.random() - 0.5) * 30 - 30;
              const x4 = (Math.random() - 0.5) * 40 - 20;
              const y4 = (Math.random() - 0.5) * 40 - 50;

              particle.style.cssText = `
                position: absolute;
                width: ${particleSize}px;
                height: ${particleSize}px;
                background-color: hsla(${particleHue}, 80%, 75%, ${particleOpacity});
                border-radius: 50%;
                left: ${20 + Math.random() * 60}%;
                top: ${20 + Math.random() * 60}%;
                filter: blur(${particleSize > 4 ? 2 : 1}px);
                pointer-events: none;
                z-index: 2;
                opacity: ${particleOpacity};
                transform: translate(0, 0);
                --x1: ${x1}px;
                --y1: ${y1}px;
                --x2: ${x2}px;
                --y2: ${y2}px;
                --x3: ${x3}px;
                --y3: ${y3}px;
                --x4: ${x4}px;
                --y4: ${y4}px;
                animation: ${
                  Math.random() > 0.5 ? "particleFloat" : "smoothParticleFloat"
                } ${
                2.5 + Math.random() * 2
              }s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
              `;

              voiceParticles.appendChild(particle);

              // 自动移除粒子元素
              setTimeout(() => {
                if (voiceParticles.contains(particle)) {
                  // 平滑淡出
                  particle.style.transition = "opacity 0.5s ease-out";
                  particle.style.opacity = "0";

                  setTimeout(() => {
                    if (voiceParticles.contains(particle)) {
                      voiceParticles.removeChild(particle);
                    }
                  }, 500);
                }
              }, 2500);
            }
          }

          // 平滑应用多层光晕效果
          const r = Math.floor(
            currentHue <= 180
              ? 30 + currentHue / 3
              : 30 + (360 - currentHue) / 2
          );
          const g = Math.floor(80 + currentLightness * 0.8);
          const b = Math.floor(120 + currentSaturation * 0.5);

          // 多层光晕效果
          pulsatingOrb.style.boxShadow = `
            0 0 ${currentGlow}px hsla(${currentHue}, ${currentSaturation}%, ${currentLightness}%, 0.9),
            0 0 ${currentGlow * 1.8}px hsla(${currentHue - 20}, ${
            currentSaturation - 10
          }%, ${currentLightness - 10}%, 0.7),
            0 0 ${currentGlow * 2.5}px hsla(${currentHue - 40}, ${
            currentSaturation - 20
          }%, ${currentLightness - 20}%, 0.5),
            inset 0 0 ${30 + currentGlow / 3}px rgba(255, 255, 255, ${
            0.4 + intensity * 0.4
          })
          `;

          // 使用平滑过渡的色值更新渐变背景
          pulsatingOrb.style.background = `radial-gradient(
            circle, 
            hsla(${currentHue + 20}, ${currentSaturation}%, ${
            currentLightness + 10
          }%, 0.9) 0%,
            hsla(${currentHue}, ${currentSaturation}%, ${
            currentLightness - 5
          }%, 0.7) 60%,
            hsla(${currentHue - 20}, ${currentSaturation - 10}%, ${
            currentLightness - 15
          }%, 0.6) 100%
          )`;

          // 设置光晕内部明暗对比
          const innerGlow = document.querySelector(".inner-glow");
          if (innerGlow) {
            innerGlow.style.opacity = currentInnerGlowOpacity.toString();
          }
        }
      }
    } catch (error) {
      console.error("Error processing audio data:", error);
    }
  }
});

// Handle content end events
socket.on("contentEnd", (data) => {
  console.log("Content end received:", data);

  if (data.type === "TEXT") {
    if (role === "USER") {
      // When user's text content ends, make sure assistant thinking is shown
      hideUserThinkingIndicator();
      showAssistantThinkingIndicator();
    } else if (role === "ASSISTANT") {
      // When assistant's text content ends, prepare for user input in next turn
      hideAssistantThinkingIndicator();
    }

    // Handle stop reasons
    if (data.stopReason && data.stopReason.toUpperCase() === "END_TURN") {
      chatHistoryManager.endTurn();
    } else if (
      data.stopReason &&
      data.stopReason.toUpperCase() === "INTERRUPTED"
    ) {
      console.log("Interrupted by user");
      audioPlayer.bargeIn();
    }
  } else if (data.type === "AUDIO") {
    // When audio content ends, we may need to show user thinking indicator
    if (isStreaming) {
      showUserThinkingIndicator();
    }
  }
});

// Stream completion event
socket.on("streamComplete", () => {
  if (isStreaming) {
    stopStreaming();
  }
  statusElement.textContent = "已准备就绪";
  statusElement.className = "ready";

  // 确保会话状态被重置，防止服务器关闭会话后客户端状态不同步
  sessionInitialized = false;
});

// 处理麦克风权限请求
async function handleRequestPermission() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    micPermissionError = false;
    // 刷新页面以重新初始化音频
    window.location.reload();
  } catch (error) {
    console.error("麦克风权限请求被拒绝:", error);
    micPermissionError = true;
    statusElement.textContent =
      "麦克风权限被拒绝。请在浏览器设置中允许麦克风访问。";
    statusElement.className = "error";
  }
}

// Handle connection status updates
socket.on("connect", () => {
  statusElement.textContent = "已连接到服务器";
  statusElement.className = "connected";
  sessionInitialized = false;
});

socket.on("disconnect", () => {
  statusElement.textContent = "已断开连接";
  statusElement.className = "disconnected";
  startButton.disabled = true;
  stopButton.disabled = true;
  sessionInitialized = false;
  hideUserThinkingIndicator();
  hideAssistantThinkingIndicator();
  stopAudioVisualization();
});

// Handle errors
socket.on("error", (error) => {
  console.error("Server error:", error);
  statusElement.textContent =
    "错误：" + (error.message || JSON.stringify(error).substring(0, 100));
  statusElement.className = "error";
  hideUserThinkingIndicator();
  hideAssistantThinkingIndicator();
});

// Button event listeners
startButton.addEventListener("click", toggleMute);
stopButton.addEventListener("click", toggleConversation);

// 文本按钮用于显示/隐藏对话信息
textButton.addEventListener("click", () => {
  isChatVisible = !isChatVisible;

  // 更新文本按钮样式
  textButton.style.backgroundColor = isChatVisible ? "#4cd964" : "#ff3b30"; // 绿色或红色

  // 显示或隐藏聊天容器
  if (isChatVisible) {
    chatContainer.style.display = "block";
    updateChatUI(); // 更新聊天界面
  } else {
    chatContainer.style.display = "none";
  }
});

// 初始化页面显示强制使用深色主题
document.body.style.backgroundColor = "#000000";
document.body.style.color = "#FFFFFF";

// 加载MCP服务器信息
async function loadMcpServers() {
  const mcpServersContainer = document.getElementById("mcp-servers-container");

  try {
    // 发送请求获取MCP服务器信息
    const response = await fetch("/api/mcp-servers");

    if (response.ok) {
      const mcpServers = await response.json();

      // 清空容器
      mcpServersContainer.innerHTML = "";

      if (Object.keys(mcpServers).length === 0) {
        mcpServersContainer.innerHTML = "<p>未配置MCP服务器</p>";
        return;
      }

      // 遍历服务器信息并创建UI
      Object.entries(mcpServers).forEach(([serverName, serverInfo]) => {
        const serverElement = document.createElement("div");
        serverElement.className = "mcp-server";

        // 创建服务器标题行
        const serverHeader = document.createElement("div");
        serverHeader.className = "mcp-server-header";

        const nameElement = document.createElement("div");
        nameElement.className = "mcp-server-name";
        nameElement.textContent = serverName;

        const statusElement = document.createElement("div");
        statusElement.className = serverInfo.disabled
          ? "mcp-server-status disabled"
          : "mcp-server-status";
        statusElement.textContent = serverInfo.disabled ? "已禁用" : "已启用";

        serverHeader.appendChild(nameElement);
        serverHeader.appendChild(statusElement);
        serverElement.appendChild(serverHeader);

        // 服务器基本信息
        const infoElement = document.createElement("div");
        // infoElement.className = "mcp-server-info";
        // infoElement.innerHTML = `
        //   <div>命令: ${serverInfo.command}</div>
        //   <div>参数: ${serverInfo.args.join(", ")}</div>
        // `;
        infoElement.innerHTML = '';  // 清空当前内容
        const commandDiv = document.createElement('div');
        const commandText = document.createTextNode(`命令: ${serverInfo.command}`);
        commandDiv.appendChild(commandText);
        infoElement.appendChild(commandDiv);

        const argsDiv = document.createElement('div');
        const argsText = document.createTextNode(`参数: ${serverInfo.args.join(", ")}`);
        argsDiv.appendChild(argsText);
        infoElement.appendChild(argsDiv);
        
        serverElement.appendChild(infoElement);

        // 工具信息
        if (serverInfo.tools && serverInfo.tools.length > 0) {
          const toolsTitle = document.createElement("div");
          toolsTitle.className = "mcp-tools-title collapsed";
          toolsTitle.textContent = `可用工具 (${serverInfo.tools.length})`;
          serverElement.appendChild(toolsTitle);

          const toolsList = document.createElement("div");
          toolsList.className = "mcp-tools-list";
          toolsList.style.display = "none"; // 默认折叠

          // 添加工具列表内容
          serverInfo.tools.forEach((tool) => {
            const toolElement = document.createElement("div");
            toolElement.className = "mcp-tool";

            const toolName = document.createElement("div");
            toolName.className = "mcp-tool-name";
            toolName.textContent = tool.name;

            const toolDesc = document.createElement("div");
            toolDesc.className = "mcp-tool-description";
            toolDesc.textContent = tool.description || "无描述";

            toolElement.appendChild(toolName);
            toolElement.appendChild(toolDesc);
            toolsList.appendChild(toolElement);
          });

          serverElement.appendChild(toolsList);

          // 添加点击事件，切换展开/折叠状态
          toolsTitle.addEventListener("click", () => {
            const isCollapsed = toolsTitle.classList.contains("collapsed");

            // 切换样式和显示状态
            if (isCollapsed) {
              toolsTitle.classList.remove("collapsed");
              toolsList.style.display = "block";
            } else {
              toolsTitle.classList.add("collapsed");
              toolsList.style.display = "none";
            }
          });
        } else {
          const noTools = document.createElement("div");
          noTools.className = "mcp-server-info";
          noTools.textContent = "该服务器未提供工具";
          serverElement.appendChild(noTools);
        }

        mcpServersContainer.appendChild(serverElement);
      });
    } else {
      mcpServersContainer.innerHTML = "<p>获取MCP服务器信息失败</p>";
    }
  } catch (error) {
    console.error("加载MCP服务器信息失败:", error);
    mcpServersContainer.innerHTML = "<p>加载MCP服务器信息时出错</p>";
  }
}

// Initialize the app when the page loads
document.addEventListener("DOMContentLoaded", () => {
  initAudio();
  initConfigModal();
  initVoiceDropdown(); // 初始化声音选择下拉菜单

  // 设置文本按钮初始样式
  textButton.style.backgroundColor = "#4cd964"; // 绿色，表示聊天信息可见
});
