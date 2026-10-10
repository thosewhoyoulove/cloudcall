# 技术深挖

1. **为什么 Core Headless**：`packages/core/src/types.ts` 将 transport、media、host 都定义为端口，`sdk.ts` 仅依赖端口。React/Vue 版本不会污染协议层，也可在测试中无浏览器运行。
2. **状态机设计**：`call-machine.ts` 使用 `CallEvent` 判别联合与每状态白名单；终态幂等，非法转换抛出结构化错误。测试覆盖重复挂断与过期序列。
3. **重连不只是 connect**：`connection-manager.ts` 使用指数退避和 full jitter，同时区分 replay-safe 消息；重连后仍需由上层拉取服务端快照完成一致性恢复。
4. **信令/UI 竞态**：`CallSession.command` 先提交本地终止意图，终态屏蔽晚到接通；`applyRemote` 的媒体请求携带实例 AbortSignal，销毁后不回写。
5. **多宿主**：Core 发布命令和快照；React 用订阅，Vue 用 shallowRef，iframe 使用带协议版本、requestId、origin/source 校验的 RPC。
6. **包体积与依赖冲突**：所有包 ESM、`sideEffects:false`，React/Vue 外置为 peer；UI 样式是唯一 side effect。可用构建产物实际记录 gzip 大小，当前文档不编造数字。
7. **WebRTC 资源治理**：`BrowserMediaManager` 按 callId 保存流，release 停止每条 track，destroy 回收所有流；输出设备能力做运行时检测。
8. **初始化/销毁安全**：并发 init 共享 Promise；并发 destroy 只释放一次；destroy during init 触发 Scope Abort；销毁后禁止复活。
9. **TypeScript 协议约束**：事件、命令、状态均为字面量联合，strict + exactOptionalPropertyTypes 防止“字段存在但值 undefined”的模糊协议。
10. **测试策略**：纯 reducer 单测覆盖组合爆炸的核心，adapter 用契约测试，SDK 做竞态和双实例，100 次压力测试看资源计数，Playwright 只验证用户关键路径。
