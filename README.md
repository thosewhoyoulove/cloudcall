# CloudCall SDK

面向 CRM、销售管理与呼叫中心场景的企业级云呼叫前端 SDK 参考实现。核心是框架无关的 Headless SDK；Playground 使用真实 Core 配合明确标记的 Mock 信令/媒体适配器运行。

## 快速开始

```bash
pnpm install
pnpm dev
```

访问 `http://localhost:5173`。执行完整校验：

```bash
pnpm run ci
pnpm test:e2e # 首次需 pnpm exec playwright install chromium
pnpm benchmark
```

## 包

| 包                         | 职责                                                |
| -------------------------- | --------------------------------------------------- |
| `@cloudcall/core`          | 生命周期、会话状态机、公开 Facade、事件、资源作用域 |
| `@cloudcall/signaling`     | WebSocket 连接管理、可靠性语义、Mock Transport      |
| `@cloudcall/webrtc`        | 浏览器媒体资源与 Mock Media Adapter                 |
| `@cloudcall/react` / `vue` | 薄框架绑定，不承载业务状态                          |
| `@cloudcall/ui`            | 可选 React UI 组件                                  |
| `@cloudcall/iframe`        | 校验 origin/source 的 RPC 客户端                    |

## 接入

```ts
import { createCloudCall } from '@cloudcall/core';

const sdk = createCloudCall({ transport, media, host, config: { callTimeoutMs: 30_000 } });
await sdk.init();
const call = await sdk.dial({ phoneNumber: '10086' });
await call.hangup();
await sdk.destroy();
```

`init` 与 `destroy` 幂等；销毁是终态，实例不可复用。重新初始化请创建新实例。这让 AbortSignal、监听器、媒体轨道和连接的所有权保持清晰。

## 能力边界

- **已实现并可本地验证**：Mock 模式拨入/拨出、接听/拒接/挂断、静音、保持、DTMF、转接命令、并发会话、超时、乱序/重复消息、生命周期清理、React/Vue 绑定和 iframe RPC。
- **浏览器真实媒体**：`getUserMedia`、设备枚举、输出设备切换、轨道释放。需要 HTTPS/localhost 与用户授权。
- **真实信令底座**：`ConnectionManager` 提供心跳、退避抖动、请求关联、取消与安全重放边界。
- **未声称已验证**：真实 SIP/PBX 呼叫。项目没有内置账号或凭证，也没有把 UI 状态冒充 SIP。接入需要 WSS SIP 服务、后端签发的短期凭证、STUN/TURN、号码路由与合规配置。具体 SIP.js Adapter 是后续集成点。

## 目录

架构与决策见 [docs/architecture.md](docs/architecture.md)，面试材料见 [docs/interview](docs/interview)。
