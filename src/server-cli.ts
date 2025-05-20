/**
 * Nova Sonic 服务器启动入口
 * 用于启动 WebSocket 服务器
 */

import "./server";

console.log("Nova Sonic 服务器已启动");

// 捕获未处理的异常和 Promise 拒绝
process.on("uncaughtException", (error) => {
  console.error("未捕获的异常:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("未处理的 Promise 拒绝:", promise, "原因:", reason);
});
