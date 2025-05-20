import axios from "axios";
import https from "https";
import { WeatherParseResult } from "../types/types";

// 定义 MCP 工具处理函数类型
export type McpToolHandler = (toolUseContent: any) => Promise<any>;

// MCP 工具信息
export interface McpToolInfo {
  handler: McpToolHandler;
  serverName: string;
  description: string;
  isAutoApproved: boolean;
}

/**
 * 工具处理类
 * 负责处理各种工具的调用和响应
 */
export class ToolHandler {
  // 存储 MCP 工具信息
  private mcpTools: Map<string, McpToolInfo> = new Map();

  /**
   * 处理工具调用
   * @param toolName 工具名称
   * @param toolUseContent 工具使用内容
   */
  public async processToolUse(
    toolName: string,
    toolUseContent: object
  ): Promise<Object> {
    // 检查是否是 MCP 工具
    if (this.mcpTools.has(toolName)) {
      console.log(`处理 MCP 工具调用: ${toolName}`);
      const toolInfo = this.mcpTools.get(toolName);
      if (toolInfo) {
        try {
          return await toolInfo.handler(toolUseContent);
        } catch (error) {
          console.error(`MCP 工具 ${toolName} 调用失败:`, String(error));
          throw new Error(
            `MCP 工具 ${toolName} 调用失败: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }

    // 处理内置工具
    const tool = toolName.toLowerCase();
    switch (tool) {
      case "getdateandtimetool":
        return this.getDateAndTime();
      case "getweathertool":
        console.log("处理天气工具调用");
        const parsedContent = await this.parseToolUseContentForWeather(
          toolUseContent
        );
        if (!parsedContent) {
          throw new Error("解析内容为空");
        }
        return this.fetchWeatherData(
          parsedContent.latitude,
          parsedContent.longitude
        );
      default:
        console.log(`不支持的工具 ${tool}`);
        throw new Error(`不支持的工具 ${tool}`);
    }
  }

  /**
   * 注册 MCP 工具
   * @param toolName 工具名称
   * @param handler 处理函数
   * @param serverName 服务器名称
   * @param description 工具描述
   * @param isAutoApproved 是否自动批准
   */
  public registerMcpTool(
    toolName: string,
    handler: McpToolHandler,
    serverName: string,
    description: string = "",
    isAutoApproved: boolean = false
  ): void {
    console.log(
      `注册 MCP 工具: ${serverName}/${toolName} (自动批准: ${isAutoApproved})`
    );
    this.mcpTools.set(toolName, {
      handler,
      serverName,
      description,
      isAutoApproved,
    });
  }

  /**
   * 获取所有已注册的 MCP 工具信息
   */
  public getRegisteredMcpTools(): Map<string, McpToolInfo> {
    return this.mcpTools;
  }

  /**
   * 获取所有已注册的 MCP 工具名称
   */
  public getRegisteredMcpToolNames(): string[] {
    return Array.from(this.mcpTools.keys());
  }

  /**
   * 获取工具的服务器名称
   */
  public getToolServerName(toolName: string): string | null {
    const toolInfo = this.mcpTools.get(toolName);
    return toolInfo ? toolInfo.serverName : null;
  }

  /**
   * 检查工具是否自动批准
   */
  public isToolAutoApproved(toolName: string): boolean {
    const toolInfo = this.mcpTools.get(toolName);
    return toolInfo ? toolInfo.isAutoApproved : false;
  }

  /**
   * 获取日期和时间信息
   */
  private getDateAndTime(): Object {
    const date = new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
    });
    const pstDate = new Date(date);

    return {
      date: pstDate.toISOString().split("T")[0],
      year: pstDate.getFullYear(),
      month: pstDate.getMonth() + 1,
      day: pstDate.getDate(),
      dayOfWeek: pstDate
        .toLocaleString("en-US", { weekday: "long" })
        .toUpperCase(),
      timezone: "PST",
      formattedTime: pstDate.toLocaleTimeString("en-US", {
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  }

  /**
   * 解析天气工具的使用内容
   * @param toolUseContent 工具使用内容
   */
  private async parseToolUseContentForWeather(
    toolUseContent: any
  ): Promise<WeatherParseResult | null> {
    try {
      if (toolUseContent && typeof toolUseContent.content === "string") {
        const parsedContent = JSON.parse(toolUseContent.content);
        console.log(`解析的内容: ${parsedContent}`);

        return {
          latitude: parsedContent.latitude,
          longitude: parsedContent.longitude,
        };
      }
      return null;
    } catch (error) {
      console.error("解析工具使用内容失败:", error);
      return null;
    }
  }

  /**
   * 获取天气数据
   * @param latitude 纬度
   * @param longitude 经度
   */
  private async fetchWeatherData(
    latitude: number,
    longitude: number
  ): Promise<Record<string, any>> {
    const ipv4Agent = new https.Agent({ family: 4 });
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;

    try {
      const response = await axios.get(url, {
        httpsAgent: ipv4Agent,
        timeout: 5000,
        headers: {
          "User-Agent": "MyApp/1.0",
          Accept: "application/json",
        },
      });
      const weatherData = response.data;
      console.log("天气数据:", weatherData);

      return {
        weather_data: weatherData,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`获取天气数据失败: ${error.message}`, String(error));
      } else {
        console.error(
          `意外错误: ${error instanceof Error ? error.message : String(error)}`,
          String(error)
        );
      }
      throw error;
    }
  }
}
