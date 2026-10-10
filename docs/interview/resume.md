# 简历表达

## 项目简介

从零设计 CloudCall 企业云呼叫前端 SDK，采用 pnpm Monorepo 拆分 Headless Core、信令、浏览器媒体、框架绑定与可选 UI，并以可故障注入 Playground 验证通话全生命周期。

## 技术栈

TypeScript Strict、React 19、Vue 3、Vite 7、WebSocket、WebRTC Media API、Vitest、Testing Library、Playwright、Changesets。

## 项目亮点

- 用显式有限状态机和判别联合收口通话转换，处理挂断/接通竞态、乱序、重复消息和幂等操作。
- 设计 ResourceScope + AbortSignal 生命周期治理，统一释放订阅、计时器、连接和媒体轨道，并以 100 次创建销毁压力测试验证。
- 将不可靠 WebSocket 提升为具备心跳、full-jitter 重连、请求关联和安全重放边界的连接管理层。
- 通过 Ports & Adapters 支持 React/Vue/iframe 多宿主，Core 不依赖 UI 框架，降低依赖冲突。
- 使用真实 Core + Mock adapters 构造可注入故障的独立演示，清楚区分已验证 Mock 与待接入 SIP 能力。

## 1 分钟介绍

CloudCall 是一套面向 B 端 SaaS 的 Headless 云呼叫 SDK。重点不是拨号盘 UI，而是处理实时通信中的生命周期、状态竞态和连接不可靠性。我把 Core 与信令、媒体、宿主能力解耦；每个会话由状态机管理，SDK 用 ResourceScope 统一取消异步任务。WebSocket 层不会盲目重放非幂等指令。项目带 React/Vue/iframe 接入、故障注入 Playground、单元/E2E/压力测试，并明确真实 SIP 仍需基础设施配置。

## 3 分钟介绍

先讲依赖方向：宿主绑定依赖 Core，Core 只依赖 Transport、Media、Host 三个接口。拨号后，所有 UI 与服务端事件进入同一个 CallSession；命令串行化，事件由纯状态机转换。用户挂断恰逢接通时，本地终态先建立，晚到事件不能复活。SDK 销毁会 abort 所有在途鉴权和媒体请求。连接层采用带抖动指数退避，但只缓存明确可安全重放的消息。Playground 不是写死 UI，而是用 Mock adapters 驱动真实 Core。测试分层覆盖 reducer、adapter 契约、生命周期竞态、双实例和浏览器关键路径。

## 5 分钟架构深挖

在三分钟版本基础上展开三个权衡：第一，当前状态空间适合零依赖纯 reducer；会议/咨询转接引入正交状态后可迁移 XState actor。第二，销毁后不允许复活，牺牲少量便利换取明确实例代际。第三，WebSocket 重连只恢复通道，不代表业务状态恢复，因此真实 adapter 必须在重连后获取服务器快照，按 sequence 合并；对结果未知的拨号命令返回明确失败，由业务核对而非自动重试。最后展示 `call-machine.test.ts`、`sdk.test.ts` 与能力矩阵，说明哪些结果已执行，哪些仍依赖真实 PBX。
