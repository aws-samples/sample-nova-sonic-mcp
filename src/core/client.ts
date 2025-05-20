import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { randomUUID } from "node:crypto";
import { firstValueFrom } from "rxjs";
import { take } from "rxjs/operators";
import { Subject } from "rxjs";
import { Buffer } from "node:buffer";

import {
  NovaSonicBidirectionalStreamClientConfig,
  SessionData,
} from "../types/types";
import { StreamSession } from "./session";
import { ToolHandler } from "../services/tools";
import { EventManager } from "./events";

/**
 * Nova Sonic 双向流客户端
 * 负责管理音频流会话、工具调用和事件处理
 */
export class NovaSonicBidirectionalStreamClient {
  private bedrockRuntimeClient: BedrockRuntimeClient;
  private inferenceConfig: any;
  private activeSessions: Map<string, SessionData> = new Map();
  private sessionLastActivity: Map<string, number> = new Map();
  private sessionCleanupInProgress = new Set<string>();
  private toolHandler: ToolHandler;
  private eventManager: EventManager;

  constructor(
    config: NovaSonicBidirectionalStreamClientConfig,
    toolHandler?: ToolHandler
  ) {
    // 初始化 HTTP2 处理器
    const nodeHttp2Handler = new NodeHttp2Handler({
      requestTimeout: 300000,
      sessionTimeout: 600000,
      disableConcurrentStreams: false,
      maxConcurrentStreams: 20,
      ...config.requestHandlerConfig,
    });

    if (!config.clientConfig.credentials) {
      throw new Error("未提供凭证");
    }

    // 初始化 Bedrock 运行时客户端
    this.bedrockRuntimeClient = new BedrockRuntimeClient({
      ...config.clientConfig,
      credentials: config.clientConfig.credentials,
      region: config.clientConfig.region || "us-east-1",
      requestHandler: nodeHttp2Handler,
    });

    this.inferenceConfig = config.inferenceConfig ?? {
      maxTokens: 1024,
      topP: 0.9,
      temperature: 1,
    };

    this.toolHandler = toolHandler || new ToolHandler();
    this.eventManager = new EventManager();
  }

  /**
   * 检查会话是否活跃
   */
  public isSessionActive(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    return !!session && session.isActive;
  }

  /**
   * 获取所有活跃会话ID
   */
  public getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  /**
   * 获取会话最后活动时间
   */
  public getLastActivityTime(sessionId: string): number {
    return this.sessionLastActivity.get(sessionId) || 0;
  }

  /**
   * 更新会话活动时间
   */
  private updateSessionActivity(sessionId: string): void {
    this.sessionLastActivity.set(sessionId, Date.now());
  }

  /**
   * 检查会话清理是否在进行
   */
  public isCleanupInProgress(sessionId: string): boolean {
    return this.sessionCleanupInProgress.has(sessionId);
  }

  /**
   * 创建新的流会话
   */
  public createStreamSession(
    sessionId: string = randomUUID(),
    config?: NovaSonicBidirectionalStreamClientConfig
  ): StreamSession {
    if (this.activeSessions.has(sessionId)) {
      throw new Error(`会话 ${sessionId} 已存在`);
    }

    const session: SessionData = {
      queue: [],
      queueSignal: new Subject<void>(),
      closeSignal: new Subject<void>(),
      responseSubject: new Subject<any>(),
      toolUseContent: null,
      toolUseId: "",
      toolName: "",
      responseHandlers: new Map(),
      promptName: randomUUID(),
      inferenceConfig: config?.inferenceConfig ?? this.inferenceConfig,
      isActive: true,
      isPromptStartSent: false,
      isAudioContentStartSent: false,
      audioContentId: randomUUID(),
      toolHandler: this.toolHandler, // 添加工具处理器到会话
    };

    this.activeSessions.set(sessionId, session);
    return new StreamSession(sessionId, this);
  }

  /**
   * 初始化会话
   */
  public async initiateSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }

    try {
      this.setupSessionStartEvent(sessionId);
      const asyncIterable = this.createSessionAsyncIterable(sessionId);
      console.log(`启动会话 ${sessionId} 的双向流...`);

      const response = await this.bedrockRuntimeClient.send(
        new InvokeModelWithBidirectionalStreamCommand({
          modelId: "amazon.nova-sonic-v1:0",
          body: asyncIterable,
        })
      );

      console.log(`会话 ${sessionId} 流建立成功,开始处理响应...`);
      await this.processResponseStream(sessionId, response);
    } catch (error) {
      console.error(`会话 ${sessionId} 出错:`, error);
      this.dispatchEventForSession(sessionId, "error", {
        source: "bidirectionalStream",
        error,
      });

      if (session.isActive) {
        this.closeSession(sessionId);
      }
    }
  }

  /**
   * 为会话分发事件
   */
  private dispatchEventForSession(
    sessionId: string,
    eventType: string,
    data: any
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const handler = session.responseHandlers.get(eventType);
    if (handler) {
      try {
        handler(data);
      } catch (e) {
        console.error(`会话 ${sessionId} 的 ${eventType} 处理器出错: `, e);
      }
    }

    const anyHandler = session.responseHandlers.get("any");
    if (anyHandler) {
      try {
        anyHandler({ type: eventType, data });
      } catch (e) {
        console.error(`会话 ${sessionId} 的通用处理器出错: `, e);
      }
    }
  }

  /**
   * 创建会话的异步迭代器
   */
  private createSessionAsyncIterable(sessionId: string): AsyncIterable<any> {
    if (!this.isSessionActive(sessionId)) {
      console.log(`无法创建异步迭代器: 会话 ${sessionId} 不活跃`);
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ value: undefined, done: true }),
        }),
      };
    }

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`无法创建异步迭代器: 会话 ${sessionId} 不存在`);
    }

    let eventCount = 0;

    return {
      [Symbol.asyncIterator]: () => {
        console.log(`请求会话 ${sessionId} 的异步迭代器`);

        return {
          next: async () => {
            try {
              if (!session.isActive || !this.activeSessions.has(sessionId)) {
                console.log(`会话 ${sessionId} 的迭代器关闭`);
                return { value: undefined, done: true };
              }

              if (session.queue.length === 0) {
                try {
                  await Promise.race([
                    firstValueFrom(session.queueSignal.pipe(take(1))),
                    firstValueFrom(session.closeSignal.pipe(take(1))).then(
                      () => {
                        throw new Error("Stream closed");
                      }
                    ),
                  ]);
                } catch (error) {
                  if (error instanceof Error) {
                    if (
                      error.message === "Stream closed" ||
                      !session.isActive
                    ) {
                      if (this.activeSessions.has(sessionId)) {
                        console.log(`会话 ${sessionId} 在等待时关闭`);
                      }
                      return { value: undefined, done: true };
                    }
                  } else {
                    console.error(`事件关闭时出错`, error);
                  }
                }
              }

              if (session.queue.length === 0 || !session.isActive) {
                console.log(`队列为空或会话不活跃: ${sessionId}`);
                return { value: undefined, done: true };
              }

              const nextEvent = session.queue.shift();
              eventCount++;

              return {
                value: {
                  chunk: {
                    bytes: new TextEncoder().encode(JSON.stringify(nextEvent)),
                  },
                },
                done: false,
              };
            } catch (error) {
              console.error(`会话 ${sessionId} 迭代器出错: `, error);
              session.isActive = false;
              return { value: undefined, done: true };
            }
          },

          return: async () => {
            console.log(`调用会话 ${sessionId} 迭代器的 return()`);
            session.isActive = false;
            return { value: undefined, done: true };
          },

          throw: async (error: any) => {
            console.log(`调用会话 ${sessionId} 迭代器的 throw() 错误: `, error);
            session.isActive = false;
            throw error;
          },
        };
      },
    };
  }

  /**
   * 处理响应流
   */
  private async processResponseStream(
    sessionId: string,
    response: any
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      for await (const event of response.body) {
        if (!session.isActive) {
          console.log(`会话 ${sessionId} 不再活跃,停止处理响应`);
          break;
        }

        if (event.chunk?.bytes) {
          try {
            this.updateSessionActivity(sessionId);
            const textResponse = new TextDecoder().decode(event.chunk.bytes);

            try {
              const jsonResponse = JSON.parse(textResponse);
              await this.handleResponseEvent(sessionId, jsonResponse, session);
            } catch (e) {
             console.log(`会话 ${sessionId} 的原始文本响应(解析错误): ${textResponse}`);
            }
          } catch (e) {
            console.error(`处理会话 ${sessionId} 的响应块时出错:`, e);
          }
        } else if (event.modelStreamErrorException) {
          this.handleModelError(sessionId, event.modelStreamErrorException);
        } else if (event.internalServerException) {
          this.handleServerError(sessionId, event.internalServerException);
        }
      }

      console.log(`会话 ${sessionId} 的响应流处理完成`);
      this.dispatchEvent(sessionId, "streamComplete", {
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.handleStreamError(sessionId, error);
    }
  }

  /**
   * 处理响应事件
   */
  private async handleResponseEvent(
    sessionId: string,
    jsonResponse: any,
    session: SessionData
  ): Promise<void> {
    if (jsonResponse.event?.contentStart) {
      this.dispatchEvent(
        sessionId,
        "contentStart",
        jsonResponse.event.contentStart
      );
    } else if (jsonResponse.event?.textOutput) {
      this.dispatchEvent(
        sessionId,
        "textOutput",
        jsonResponse.event.textOutput
      );
    } else if (jsonResponse.event?.audioOutput) {
      this.dispatchEvent(
        sessionId,
        "audioOutput",
        jsonResponse.event.audioOutput
      );
    } else if (jsonResponse.event?.toolUse) {
      await this.handleToolUse(sessionId, jsonResponse.event.toolUse, session);
    } else if (
      jsonResponse.event?.contentEnd &&
      jsonResponse.event?.contentEnd?.type === "TOOL"
    ) {
      await this.handleToolEnd(sessionId, session);
    } else if (jsonResponse.event?.contentEnd) {
      this.dispatchEvent(
        sessionId,
        "contentEnd",
        jsonResponse.event.contentEnd
      );
    } else {
      this.handleOtherEvents(sessionId, jsonResponse);
    }
  }

  /**
   * 处理工具使用
   */
  private async handleToolUse(
    sessionId: string,
    toolUse: any,
    session: SessionData
  ): Promise<void> {
    this.dispatchEvent(sessionId, "toolUse", toolUse);
    session.toolUseContent = toolUse;
    session.toolUseId = toolUse.toolUseId;
    session.toolName = toolUse.toolName;
  }

  /**
   * 处理工具结束
   */
  private async handleToolEnd(
    sessionId: string,
    session: SessionData
  ): Promise<void> {
    console.log(`处理会话 ${sessionId} 的工具使用`);
    this.dispatchEvent(sessionId, "toolEnd", {
      toolUseContent: session.toolUseContent,
      toolUseId: session.toolUseId,
      toolName: session.toolName,
    });

    const toolResult = await this.toolHandler.processToolUse(
      session.toolName,
      session.toolUseContent
    );

    this.sendToolResult(sessionId, session.toolUseId, toolResult);
    this.dispatchEvent(sessionId, "toolResult", {
      toolUseId: session.toolUseId,
      result: toolResult,
    });
  }

  /**
   * 处理其他事件
   */
  private handleOtherEvents(sessionId: string, jsonResponse: any): void {
    const eventKeys = Object.keys(jsonResponse.event || {});
    if (eventKeys.length > 0) {
      this.dispatchEvent(sessionId, eventKeys[0], jsonResponse.event);
    } else if (Object.keys(jsonResponse).length > 0) {
      this.dispatchEvent(sessionId, "unknown", jsonResponse);
    }
  }

  /**
   * 处理模型错误
   */
  private handleModelError(sessionId: string, error: any): void {
    console.error(`会话 ${sessionId} 的模型流错误:`, error);
    this.dispatchEvent(sessionId, "error", {
      type: "modelStreamErrorException",
      details: error,
    });
  }

  /**
   * 处理服务器错误
   */
  private handleServerError(sessionId: string, error: any): void {
    console.error(`会话 ${sessionId} 的内部服务器错误:`, error);
    this.dispatchEvent(sessionId, "error", {
      type: "internalServerException",
      details: error,
    });
  }

  /**
   * 处理流错误
   */
  private handleStreamError(sessionId: string, error: any): void {
    console.error(`处理会话 ${sessionId} 的响应流时出错:`, error);
    this.dispatchEvent(sessionId, "error", {
      source: "responseStream",
      message: "处理响应流时出错",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * 向会话队列添加事件
   */
  private addEventToSessionQueue(sessionId: string, event: any): void {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) return;

    this.updateSessionActivity(sessionId);
    session.queue.push(event);
    session.queueSignal.next();
  }

  /**
   * 设置会话开始事件
   */
  private setupSessionStartEvent(sessionId: string): void {
    console.log(`设置会话 ${sessionId} 的初始事件...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.addEventToSessionQueue(
      sessionId,
      this.eventManager.createSessionStartEvent(session)
    );
  }

  /**
   * 设置提示开始事件
   */
  public setupPromptStartEvent(
    sessionId: string,
    audioOutputConfig: any
  ): void {
    console.log(`设置会话 ${sessionId} 的提示开始事件...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.addEventToSessionQueue(
      sessionId,
      this.eventManager.createPromptStartEvent(session, audioOutputConfig)
    );
    session.isPromptStartSent = true;
  }

  /**
   * 设置系统提示事件
   */
  public setupSystemPromptEvent(
    sessionId: string,
    textConfig: any,
    systemPromptContent: string
  ): void {
    console.log(`设置会话 ${sessionId} 的系统提示事件...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const events = this.eventManager.createSystemPromptEvents(
      session,
      textConfig,
      systemPromptContent
    );
    events.forEach((event) => this.addEventToSessionQueue(sessionId, event));
  }

  /**
   * 设置开始音频事件
   */
  public setupStartAudioEvent(sessionId: string, audioConfig: any): void {
    console.log(`设置会话 ${sessionId} 的开始音频事件...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.addEventToSessionQueue(
      sessionId,
      this.eventManager.createStartAudioEvent(session, audioConfig)
    );
    session.isAudioContentStartSent = true;
  }

  /**
   * 流式传输音频数据块
   */
  public async streamAudioChunk(
    sessionId: string,
    audioData: Buffer
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive || !session.audioContentId) {
      throw new Error(`会话 ${sessionId} 无效,无法传输音频`);
    }

    const base64Data = audioData.toString("base64");
    this.addEventToSessionQueue(
      sessionId,
      this.eventManager.createAudioInputEvent(session, base64Data)
    );
  }

  /**
   * 发送工具结果
   */
  private async sendToolResult(
    sessionId: string,
    toolUseId: string,
    result: any
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) return;

    console.log(`发送会话 ${sessionId} 的工具结果, 工具使用ID: ${toolUseId}`);
    const events = this.eventManager.createToolResultEvents(
      session,
      toolUseId,
      result
    );
    events.forEach((event) => this.addEventToSessionQueue(sessionId, event));
  }

  /**
   * 发送内容结束事件
   */
  public async sendContentEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isAudioContentStartSent) return;

    this.addEventToSessionQueue(
      sessionId,
      this.eventManager.createContentEndEvent(session)
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  /**
   * 发送提示结束事件
   */
  public async sendPromptEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isPromptStartSent) return;

    this.addEventToSessionQueue(
      sessionId,
      this.eventManager.createPromptEndEvent(session)
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  /**
   * 发送会话结束事件
   */
  public async sendSessionEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.addEventToSessionQueue(
      sessionId,
      this.eventManager.createSessionEndEvent()
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    session.isActive = false;
    session.closeSignal.next();
    session.closeSignal.complete();
    this.activeSessions.delete(sessionId);
    this.sessionLastActivity.delete(sessionId);
    console.log(`会话 ${sessionId} 已关闭并从活跃会话中移除`);
  }

  /**
   * 注册事件处理器
   */
  public registerEventHandler(
    sessionId: string,
    eventType: string,
    handler: (data: any) => void
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }
    session.responseHandlers.set(eventType, handler);
  }

  /**
   * 分发事件
   */
  private dispatchEvent(sessionId: string, eventType: string, data: any): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const handler = session.responseHandlers.get(eventType);
    if (handler) {
      try {
        handler(data);
      } catch (e) {
        console.error(`会话 ${sessionId} 的 ${eventType} 处理器出错:`, e);
      }
    }

    const anyHandler = session.responseHandlers.get("any");
    if (anyHandler) {
      try {
        anyHandler({ type: eventType, data });
      } catch (e) {
        console.error(`会话 ${sessionId} 的通用处理器出错:`, e);
      }
    }
  }

  /**
   * 关闭会话
   */
  public async closeSession(sessionId: string): Promise<void> {
    if (this.sessionCleanupInProgress.has(sessionId)) {
      console.log(`会话 ${sessionId} 的清理正在进行,跳过`);
      return;
    }

    this.sessionCleanupInProgress.add(sessionId);
    try {
      console.log(`开始关闭会话 ${sessionId}`);
      await this.sendContentEnd(sessionId);
      await this.sendPromptEnd(sessionId);
      await this.sendSessionEnd(sessionId);
      console.log(`会话 ${sessionId} 清理完成`);
    } catch (error) {
      console.error(`会话 ${sessionId} 的关闭序列出错:`, error);

      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.isActive = false;
        this.activeSessions.delete(sessionId);
        this.sessionLastActivity.delete(sessionId);
      }
    } finally {
      this.sessionCleanupInProgress.delete(sessionId);
    }
  }

  /**
   * 强制关闭会话
   */
  public forceCloseSession(sessionId: string): void {
    if (
      this.sessionCleanupInProgress.has(sessionId) ||
      !this.activeSessions.has(sessionId)
    ) {
      console.log(`会话 ${sessionId} 已在清理中或不活跃`);
      return;
    }

    this.sessionCleanupInProgress.add(sessionId);
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) return;

      console.log(`强制关闭会话 ${sessionId}`);

      session.isActive = false;
      session.closeSignal.next();
      session.closeSignal.complete();
      this.activeSessions.delete(sessionId);
      this.sessionLastActivity.delete(sessionId);

      console.log(`会话 ${sessionId} 已强制关闭`);
    } finally {
      this.sessionCleanupInProgress.delete(sessionId);
    }
  }
}
