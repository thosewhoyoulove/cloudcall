# CloudCall SDK

面向 CRM、销售管理与呼叫中心场景的云呼叫 SDK。核心是框架无关的 Headless SDK；开发 Playground 默认使用 Mock，生产构建默认使用真实 SIP/WebRTC 模式，并包含登录 API 与部署配置。真实服务器与外线仍需开通和验收。

## 快速开始

```bash
pnpm install
pnpm dev
```

访问 `http://localhost:5173`。执行完整校验：

```bash
pnpm run ci
pnpm test:e2e # 首次需 pnpm exec playwright install chromium
pnpm test:production # 生产登录与配置失败路径浏览器测试，不替代实网验收
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
- **真实 SIP 适配器已实现，实网待验收**：`SipTransport` 使用 SIP.js 管理注册、拨入/拨出、音频、静音、保持和 RTP DTMF。生产构建默认使用真实模式，需通过后端登录取得受限分机配置。单通话，转接暂未开放；连接中断后需手动重新连接。
- **部署资源仍需配置**：WSS PBX、TLS、TURN、分机及手机外线；没有账号或线路就无法实际拨通。分机凭证使用 PBX digest 密码，TURN 使用短期凭证，不声称已完成实网通话验证。见 [生产部署与验收](docs/production.md)。

## 目录

架构与决策见 [docs/architecture.md](docs/architecture.md)，面试材料见 [docs/interview](docs/interview)。
