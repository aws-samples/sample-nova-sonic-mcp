import { Buffer } from "node:buffer";
import { NovaSonicBidirectionalStreamClient } from "./client";
import {
  DefaultAudioInputConfiguration,
  DefaultTextConfiguration,
  DefaultSystemPrompt,
  DefaultAudioOutputConfiguration,
} from "../config/consts";

/**
 * StreamSession 类
 * 负责管理单个音频流会话,包括音频缓冲、事件处理等
 */
export class StreamSession {
  private audioBufferQueue: Buffer[] = [];
  private maxQueueSize = 200; // 最大音频队列大小
  private isProcessingAudio = false;
  private isActive = true;
  private voiceId: string = "tiffany"; // 默认语音ID

  constructor(
    private sessionId: string,
    private client: NovaSonicBidirectionalStreamClient
  ) {}

  /**
   * 设置语音ID
   * @param voiceId 语音ID
   */
  public setVoiceId(voiceId: string): void {
    this.voiceId = voiceId;
    console.log(`会话 ${this.sessionId} 的语音ID已设置为 ${voiceId}`);
  }

  /**
   * 获取当前语音ID
   */
  public getVoiceId(): string {
    return this.voiceId;
  }

  /**
   * 注册事件处理器
   * @param eventType 事件类型
   * @param handler 处理函数
   */
  public onEvent(
    eventType: string,
    handler: (data: any) => void
  ): StreamSession {
    this.client.registerEventHandler(this.sessionId, eventType, handler);
    return this;
  }

  /**
   * 设置提示开始事件
   */
  public async setupPromptStart(
    audioOutputConfig?: typeof DefaultAudioOutputConfiguration
  ): Promise<void> {
    // 创建自定义的音频输出配置，使用当前设置的voiceId
    const customAudioConfig = {
      ...DefaultAudioOutputConfiguration,
      voiceId: this.voiceId,
      ...audioOutputConfig, // 合并可选的自定义配置
    };

    console.log(`使用语音ID: ${customAudioConfig.voiceId} 初始化会话`);
    this.client.setupPromptStartEvent(this.sessionId, customAudioConfig);
  }

  /**
   * 设置系统提示事件
   * @param textConfig 文本配置
   * @param systemPromptContent 系统提示内容
   */
  public async setupSystemPrompt(
    textConfig: typeof DefaultTextConfiguration = DefaultTextConfiguration,
    systemPromptContent: string = DefaultSystemPrompt
  ): Promise<void> {
    this.client.setupSystemPromptEvent(
      this.sessionId,
      textConfig,
      systemPromptContent
    );
  }

  /**
   * 设置开始音频事件
   * @param audioConfig 音频配置
   */
  public async setupStartAudio(
    audioConfig: typeof DefaultAudioInputConfiguration = DefaultAudioInputConfiguration
  ): Promise<void> {
    this.client.setupStartAudioEvent(this.sessionId, audioConfig);
  }

  /**
   * 流式传输音频数据
   * @param audioData 音频数据
   */
  public async streamAudio(audioData: Buffer): Promise<void> {
    if (this.audioBufferQueue.length >= this.maxQueueSize) {
      this.audioBufferQueue.shift();
      console.log("音频队列已满,丢弃最早的数据块");
    }

    this.audioBufferQueue.push(audioData);
    this.processAudioQueue();
  }

  /**
   * 处理音频队列
   */
  private async processAudioQueue() {
    if (
      this.isProcessingAudio ||
      this.audioBufferQueue.length === 0 ||
      !this.isActive
    )
      return;

    this.isProcessingAudio = true;
    try {
      let processedChunks = 0;
      const maxChunksPerBatch = 5;

      while (
        this.audioBufferQueue.length > 0 &&
        processedChunks < maxChunksPerBatch &&
        this.isActive
      ) {
        const audioChunk = this.audioBufferQueue.shift();
        if (audioChunk) {
          await this.client.streamAudioChunk(this.sessionId, audioChunk);
          processedChunks++;
        }
      }
    } finally {
      this.isProcessingAudio = false;

      if (this.audioBufferQueue.length > 0 && this.isActive) {
        setTimeout(() => this.processAudioQueue(), 0);
      }
    }
  }

  /**
   * 获取会话ID
   */
  public getSessionId(): string {
    return this.sessionId;
  }

  /**
   * 结束音频内容
   */
  public async endAudioContent(): Promise<void> {
    if (!this.isActive) return;
    await this.client.sendContentEnd(this.sessionId);
  }

  /**
   * 结束提示
   */
  public async endPrompt(): Promise<void> {
    if (!this.isActive) return;
    await this.client.sendPromptEnd(this.sessionId);
  }

  /**
   * 关闭会话
   */
  public async close(): Promise<void> {
    if (!this.isActive) return;

    this.isActive = false;
    this.audioBufferQueue = [];
    this.isProcessingAudio = false;

    await new Promise((resolve) => setTimeout(resolve, 100));

    await this.client.sendSessionEnd(this.sessionId);
    console.log(`会话 ${this.sessionId} 已关闭`);
  }
}
