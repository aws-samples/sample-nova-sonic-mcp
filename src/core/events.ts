import { randomUUID } from "node:crypto";
import { McpTool, SessionData } from "../types/types";
import { DefaultToolSchema, WeatherToolSchema } from "../config/consts";

/**
 * 事件管理类
 * 负责处理会话相关的事件生成和管理
 */
export class EventManager {
  /**
   * 创建会话开始事件
   * @param session 会话数据
   */
  public createSessionStartEvent(session: SessionData): object {
    return {
      event: {
        sessionStart: {
          inferenceConfiguration: session.inferenceConfig,
        },
      },
    };
  }

  /**
   * 创建提示开始事件
   * @param session 会话数据
   * @param audioOutputConfig 音频输出配置
   */
  public createPromptStartEvent(
    session: SessionData,
    audioOutputConfig: any
  ): object {
    // 获取已注册的 MCP 工具
    const toolHandler = session.toolHandler;
    const mcpTools: Array<{ name: string; description: string; schema: any }> =
      [];

    if (toolHandler) {
      const mcpToolsMap = toolHandler.getRegisteredMcpTools();
      mcpToolsMap.forEach((info, name) => {
        mcpTools.push({
          name,
          description: info.description || `MCP 工具: ${name}`,
          schema: DefaultToolSchema, // 可以改为从 toolHandler 获取实际的 schema
        });
      });
    }

    // 基本工具配置
    const baseTools = [
      {
        toolSpec: {
          name: "getDateAndTimeTool",
          description: "获取当前日期和时间信息。",
          inputSchema: {
            json: DefaultToolSchema,
          },
        },
      },
      {
        toolSpec: {
          name: "getWeatherTool",
          description: "根据WGS84坐标获取指定位置的当前天气。",
          inputSchema: {
            json: WeatherToolSchema,
          },
        },
      },
    ];

    // 添加 MCP 工具
    const mcpToolSpecs = mcpTools.map((tool) => {
      return {
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            json: tool.schema,
          },
        },
      };
    });

    console.log("****", mcpToolSpecs);
    return {
      event: {
        promptStart: {
          promptName: session.promptName,
          textOutputConfiguration: {
            mediaType: "text/plain",
          },
          audioOutputConfiguration: {
            ...audioOutputConfig,
          },
          toolUseOutputConfiguration: {
            mediaType: "application/json",
          },
          toolConfiguration: {
            tools: [...baseTools, ...mcpToolSpecs],
          },
        },
      },
    };
  }

  /**
   * 创建系统提示事件
   * @param session 会话数据
   * @param textConfig 文本配置
   * @param content 提示内容
   */
  public createSystemPromptEvents(
    session: SessionData,
    textConfig: any,
    content: string
  ): object[] {
    const textPromptID = randomUUID();
    return [
      {
        event: {
          contentStart: {
            promptName: session.promptName,
            contentName: textPromptID,
            type: "TEXT",
            interactive: true,
            role: "SYSTEM",
            textInputConfiguration: textConfig,
          },
        },
      },
      {
        event: {
          textInput: {
            promptName: session.promptName,
            contentName: textPromptID,
            content: content,
          },
        },
      },
      {
        event: {
          contentEnd: {
            promptName: session.promptName,
            contentName: textPromptID,
          },
        },
      },
    ];
  }

  /**
   * 创建开始音频事件
   * @param session 会话数据
   * @param audioConfig 音频配置
   */
  public createStartAudioEvent(session: SessionData, audioConfig: any): object {
    return {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          type: "AUDIO",
          interactive: true,
          role: "USER",
          audioInputConfiguration: audioConfig,
        },
      },
    };
  }

  /**
   * 创建音频输入事件
   * @param session 会话数据
   * @param base64AudioData Base64编码的音频数据
   */
  public createAudioInputEvent(
    session: SessionData,
    base64AudioData: string
  ): object {
    return {
      event: {
        audioInput: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          content: base64AudioData,
        },
      },
    };
  }

  /**
   * 创建内容结束事件
   * @param session 会话数据
   */
  public createContentEndEvent(session: SessionData): object {
    return {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: session.audioContentId,
        },
      },
    };
  }

  /**
   * 创建提示结束事件
   * @param session 会话数据
   */
  public createPromptEndEvent(session: SessionData): object {
    return {
      event: {
        promptEnd: {
          promptName: session.promptName,
        },
      },
    };
  }

  /**
   * 创建会话结束事件
   */
  public createSessionEndEvent(): object {
    return {
      event: {
        sessionEnd: {},
      },
    };
  }

  /**
   * 创建工具结果事件
   * @param session 会话数据
   * @param toolUseId 工具使用ID
   * @param result 工具结果
   */
  public createToolResultEvents(
    session: SessionData,
    toolUseId: string,
    result: any
  ): object[] {
    const contentId = randomUUID();
    console.log("**********", result);
    // 确保结果符合 Nova-Sonic API 期望的格式
    // 提取文本内容，避免嵌套的JSON序列化问题
    // let textContent = "";
    // if (typeof result === "string") {
    //   textContent = result;
    // } else if (Array.isArray(result)) {
    //   // 如果是数组，尝试找到第一个text类型的内容
    //   const textItem = result.find((item) => item.type === "text");
    //   if (textItem && textItem.text) {
    //     textContent = textItem.text;
    //   } else {
    //     textContent = JSON.stringify(result);
    //   }
    // } else if (result && typeof result === "object") {
    //   // 如果是对象，尝试提取text字段
    //   if (result.text) {
    //     textContent = result.text;
    //   } else {
    //     textContent = JSON.stringify(result);
    //   }
    // } else {
    //   textContent = JSON.stringify(result);
    // }
    const textContent =
      Array.isArray(result) && result.length > 0
        ? JSON.stringify(result[0])
        : typeof result === "string"
        ? result
        : JSON.stringify(result);
    console.log("------Tool result received:------", textContent);
    return [
      {
        event: {
          contentStart: {
            promptName: session.promptName,
            contentName: contentId,
            interactive: false,
            type: "TOOL",
            role: "TOOL",
            toolResultInputConfiguration: {
              toolUseId: toolUseId,
              type: "TEXT",
              textInputConfiguration: {
                mediaType: "text/plain",
              },
            },
          },
        },
      },
      {
        event: {
          toolResult: {
            promptName: session.promptName,
            contentName: contentId,
            content: textContent,
          },
        },
      },
      {
        event: {
          contentEnd: {
            promptName: session.promptName,
            contentName: contentId,
          },
        },
      },
    ];
  }
}
