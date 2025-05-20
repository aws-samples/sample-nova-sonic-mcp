import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ToolHandler } from "./tools";
import { McpConfig, McpServerConfig, McpTool } from "../types/types";
import { McpConfigLoader } from "./mcp-config";
import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
export class McpManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();
  private tools: Map<string, McpTool[]> = new Map();
  private toolHandler: ToolHandler;
  private config: McpConfig;

  constructor(toolHandler: ToolHandler) {
    this.toolHandler = toolHandler;
    this.config = McpConfigLoader.loadConfig();
  }

  /**
   * 初始化所有启用的 MCP 服务器
   */
  async initializeServers(): Promise<void> {
    const servers = Object.entries(this.config.mcpServers);
    console.log(`发现 ${servers.length} 个 MCP 服务器配置`);

    await Promise.all(
      servers.map(async ([serverName, serverConfig]) => {
        if (serverConfig.disabled !== true) {
          try {
            await this.connectToServer(serverName, serverConfig);
          } catch (error) {
            console.error(`连接到 MCP 服务器 ${serverName} 失败: ${error}`);
          }
        } else {
          console.log(`MCP 服务器 ${serverName} 已禁用，跳过连接`);
        }
      })
    );
  }

  /**
   * 连接到指定的 MCP 服务器
   */
  async connectToServer(
    serverName: string,
    config: McpServerConfig
  ): Promise<McpTool[]> {
    console.log(`正在连接 MCP 服务器: ${serverName}`);

    try {
      // 创建客户端
      const client = new Client({
        name: `nova-sonic-mcp-client-${serverName}`,
        version: "1.0.0",
        capabilities: {
          prompts: {},
          resources: {},
          tools: {},
        },
      });

      // 创建传输
      // 处理特殊命令
      let command = config.command;
      let args = [...config.args]; // 复制数组以避免修改原始配置

      if (config.command === "node") {
        // 使用process.execPath以确保使用正确的Node.js路径
        command = process.execPath;
      } else if (config.command === "npx") {
        // 对于npx命令，保持原样，因为npx通常需要在命令行中运行
        // 不需要特殊处理
      }
      console.log("MCP Server Config", JSON.stringify(config));
      console.log(`使用命令: ${command} 连接到 ${serverName}`);

      const transport = new StdioClientTransport({
        command: command,
        args: args,
        env: {
          ...getDefaultEnvironment(),
          ...config.env,
        },
        stderr: "pipe",
      });
      transport.stderr?.on("data", (data) =>
        console.info(`[MCP] Stdio stderr for server: `, data.toString())
      );
      // 连接到服务器
      await client.connect(transport);
      // 保存客户端和传输
      this.clients.set(serverName, client);
      this.transports.set(serverName, transport);

      // 获取工具列表
      const toolsResult = await client.listTools();
      const serverTools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        serverName: serverName, // 记录工具来自哪个服务器
      }));

      // 保存工具列表
      this.tools.set(serverName, serverTools);

      // 注册工具到 ToolHandler
      this.registerServerTools(
        serverName,
        serverTools,
        config.autoApprove || []
      );

      console.log(`已连接到 MCP 服务器 ${serverName}，可用工具: ${serverTools.map(({ name }) => name).join(", ")}`);

      return serverTools;
    } catch (error) {
      console.error(`连接到 MCP 服务器 ${serverName} 失败: ${error}`);
      throw error;
    }
  }

  /**
   * 注册服务器工具到 ToolHandler
   */
  private registerServerTools(
    serverName: string,
    tools: McpTool[],
    autoApproveList: string[]
  ): void {
    tools.forEach((tool) => {
      // 修改: 默认所有工具都是自动批准的，不再根据 autoApproveList 判断
      const isAutoApproved = true;
      this.toolHandler.registerMcpTool(
        tool.name,
        this.callMcpTool.bind(this, serverName, tool.name),
        serverName,
        tool.description,
        isAutoApproved
      );
    });
  }

  /**
   * 调用 MCP 工具
   */
  async callMcpTool(
    serverName: string,
    toolName: string,
    toolUseContent: any
  ): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP 服务器 ${serverName} 未连接`);
    }

    try {
      console.log(`调用 MCP 工具: ${serverName}/${toolName}`);

      // 解析工具参数
      let toolArgs: any = {};
      if (toolUseContent && typeof toolUseContent.content === "string") {
        try {
          toolArgs = JSON.parse(toolUseContent.content);
        } catch (e) {
          console.error("解析工具参数失败:", e);
        }
      }

      // 调用 MCP 工具
      const result = await client.callTool({
        name: toolName,
        arguments: toolArgs,
      });

      return result.content;
    } catch (error) {
      console.error(`调用 MCP 工具 ${serverName}/${toolName} 失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取所有可用工具
   */
  getAllTools(): McpTool[] {
    const allTools: McpTool[] = [];
    for (const tools of this.tools.values()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  /**
   * 获取特定服务器的工具
   */
  getServerTools(serverName: string): McpTool[] {
    return this.tools.get(serverName) || [];
  }

  /**
   * 获取所有服务器的配置信息
   */
  getAllServersInfo(): Map<string, McpServerConfig> {
    // 返回所有服务器的配置信息
    return new Map(Object.entries(this.config.mcpServers));
  }

  /**
   * 关闭所有 MCP 客户端连接
   */
  async closeAll(): Promise<void> {
    for (const [serverName, client] of this.clients.entries()) {
      try {
        await client.close();
        console.log(`MCP 客户端 ${serverName} 已关闭`);
      } catch (error) {
        console.error(`关闭 MCP 客户端 ${serverName} 失败: ${error}`);
      }
    }

    this.clients.clear();
    this.transports.clear();
  }
}
