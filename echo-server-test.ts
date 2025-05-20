import { ToolHandler } from "./src/services/tools";
import { McpManager } from "./src/services/mcp-manager";
import { McpConfigLoader } from "./src/services/mcp-config";

async function main() {
  console.log("===== Echo Server MCP 测试 =====");

  // 创建工具处理器
  const toolHandler = new ToolHandler();

  // 创建MCP管理器并初始化
  const mcpManager = new McpManager(toolHandler);
  await mcpManager.initializeServers();

  console.log("已注册的MCP工具:");
  const registeredTools = toolHandler.getRegisteredMcpToolNames();
  console.log(registeredTools);

  try {
    if (registeredTools.includes("echo_name")) {
      console.log("\n测试 echo_name 工具...");

      const testName = "测试用户";
      console.log(`调用参数: name="${testName}"`);

      const result = await toolHandler.processToolUse("echo_name", {
        content: JSON.stringify({
          name: testName,
        }),
      });

      console.log("调用结果:");
      console.log(result);
      console.log("\n测试成功!");
    } else {
      console.log("echo_name 工具未注册");
    }
  } catch (error) {
    console.error("测试失败:", error);
  } finally {
    // 关闭所有连接
    await mcpManager.closeAll();
  }
}

main().catch(console.error);
