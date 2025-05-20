import fs from "fs";
import path from "path";
import os from "os";
import { McpConfig } from "../types/types";

export class McpConfigLoader {
  private static CONFIG_PATHS = [
    // 项目配置路径
    path.join(process.cwd(), "mcp_config.json"),
    // 后端根路径配置
    path.join(__dirname, "../../mcp_config.json"),
    // 环境变量指定的配置路径
    process.env.MCP_CONFIG_PATH,
  ];

  /**
   * 加载 MCP 配置
   */
  static loadConfig(): McpConfig {
    // 默认空配置
    const defaultConfig: McpConfig = {
      mcpServers: {},
    };

    // 尝试从各个可能的路径加载配置
    for (const configPath of this.CONFIG_PATHS) {
      if (configPath && fs.existsSync(configPath)) {
        try {
          const configContent = fs.readFileSync(configPath, "utf-8");
          const config = JSON.parse(configContent) as McpConfig;
          console.log(`已从 ${configPath} 加载 MCP 配置`);
          return config;
        } catch (error) {
          console.error(`加载 MCP 配置文件 ${configPath} 失败: ${error}`);
        }
      }
    }

    console.log("未找到 MCP 配置文件，使用默认空配置");
    return defaultConfig;
  }

  /**
   * 保存 MCP 配置
   */
  static saveConfig(config: McpConfig, configPath?: string): boolean {
    const savePath = configPath || this.CONFIG_PATHS[0];

    if (!savePath) {
      console.error("未指定配置保存路径");
      return false;
    }

    try {
      // 确保目录存在
      const dirPath = path.dirname(savePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(savePath, JSON.stringify(config, null, 2), "utf-8");
      console.log(`MCP 配置已保存到 ${savePath}`);
      return true;
    } catch (error) {
      console.error(`保存 MCP 配置到 ${savePath} 失败: ${error}`);
      return false;
    }
  }
}
