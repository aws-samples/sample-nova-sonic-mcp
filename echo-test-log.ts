import fs from "fs";
import { ToolHandler } from "./src/services/tools";
import { McpManager } from "./src/services/mcp-manager";

// 创建日志文件
const logFile = fs.createWriteStream("echo-test.log", { flags: "w" });

function log(message: string) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}`;

  console.log(formattedMessage);
  logFile.write(formattedMessage + "\n");
}

function logObject(label: string, obj: any) {
  log(`${label}:`);
  log(JSON.stringify(obj, null, 2));
}

async function main() {
  log("===== Echo Server MCP 测试 =====");

  try {
    // 创建工具处理器
    log("创建工具处理器...");
    const toolHandler = new ToolHandler();

    // 创建MCP管理器并初始化
    log("创建MCP管理器并初始化...");
    const mcpManager = new McpManager(toolHandler);
    await mcpManager.initializeServers();

    log("已注册的MCP工具:");
    const registeredTools = toolHandler.getRegisteredMcpToolNames();
    log(registeredTools.join(", "));

    if (registeredTools.includes("echo_name")) {
      log("\n测试 echo_name 工具...");

      const testName = "测试用户";
      log(`调用参数: name="${testName}"`);

      try {
        const result = await toolHandler.processToolUse("echo_name", {
          content: JSON.stringify({
            name: testName,
          }),
        });

        log("调用成功!");
        logObject("结果", result);
      } catch (error) {
        log("调用失败:");
        if (error instanceof Error) {
          log(`错误类型: ${error.constructor.name}`);
          log(`错误信息: ${error.message}`);
          log(`堆栈: ${error.stack}`);
        } else {
          log(`未知错误: ${error}`);
        }
      }
    } else {
      log("echo_name 工具未注册");
    }
  } catch (error) {
    log("测试失败:");
    if (error instanceof Error) {
      log(`错误类型: ${error.constructor.name}`);
      log(`错误信息: ${error.message}`);
      log(`堆栈: ${error.stack}`);
    } else {
      log(`未知错误: ${error}`);
    }
  } finally {
    // 关闭所有连接并等待日志文件写入完成
    log("测试完成，关闭连接...");
    try {
      const mcpManager = new McpManager(new ToolHandler());
      await mcpManager.closeAll();
      log("连接已关闭");
    } catch (e) {
      log(`关闭连接时出错: ${e}`);
    }

    // 确保日志文件写入完成
    logFile.end(() => {
      console.log("日志文件已保存至: echo-test.log");
    });
  }
}

// 启动测试
main().catch((err) => {
  console.error("未处理的错误:", err);
  logFile.write(`未处理的错误: ${err}\n`);
  logFile.end();
});
