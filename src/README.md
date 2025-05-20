# Nova-Sonic 项目结构

代码已经按照模块功能进行了重组，形成以下目录结构：

## 目录结构

```
src/
├── core/               # 核心功能模块
│   ├── client.ts       # 双向流客户端
│   ├── events.ts       # 事件管理
│   └── session.ts      # 会话管理
├── services/           # 服务层
│   ├── server.ts       # WebSocket服务器
│   └── tools.ts        # 工具处理逻辑
├── config/             # 配置
│   └── consts.ts       # 常量定义
├── types/              # 类型定义
│   └── types.ts        # 类型声明
├── utils/              # 工具函数 (预留)
├── index.ts            # 公共API导出
├── index-cli.ts        # CLI入口
└── server-cli.ts       # 服务器启动入口
```

## 模块职责

### 核心模块 (core/)

- **client.ts**: 负责建立和管理与Amazon Bedrock的双向流连接，处理数据流和会话状态。
- **events.ts**: 处理各类事件的生成和管理，如会话开始/结束、提示开始/结束等。
- **session.ts**: 提供用户友好的会话接口，管理音频流缓冲等。

### 服务层 (services/)

- **server.ts**: WebSocket服务器实现，处理与前端的通信。
- **tools.ts**: 工具逻辑实现，如时间查询、天气查询等功能。

### 配置与类型 (config/, types/)

- **consts.ts**: 定义系统常量，如默认配置、模式字符串等。
- **types.ts**: 定义系统中使用的各种TypeScript类型。

## 运行方式

- **服务器模式**: `npm run start` 或 `npm run dev`（开发模式）
- **命令行模式**: `npm run cli`
