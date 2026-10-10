# 高级前端面试题（50 题）

|   # | 面试官提问                               | 参考回答                                                                                        | 进一步追问               | 关键代码 / 基础知识            |
| --: | ---------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------ |
|   1 | 为什么 Core 必须 Headless？              | 协议和生命周期不应依赖渲染框架，才能多宿主、易测试并避免 React 版本冲突。                       | Headless 的成本？        | `core/types.ts`；依赖倒置      |
|   2 | 为什么没有直接使用 XState？              | 当前单会话状态有限，纯 reducer 零依赖且易穷举；正交状态增多时再迁移 actor。                     | 迁移触发点？             | `call-machine.ts`；FSM         |
|   3 | 如何避免 Boolean 状态爆炸？              | 用唯一 `CallState` 联合表达互斥状态，附属属性仅保存 mute 等正交状态。                           | 会议通话怎么建模？       | 判别联合、状态图               |
|   4 | 挂断和接通同时发生怎么办？               | 本地挂断先进入不可逆终态，晚到接通被终态规则忽略。                                              | 服务端其实接通了呢？     | `call-machine.test.ts`；竞态   |
|   5 | 如何处理乱序事件？                       | 优先使用服务端单调 sequence；旧 revision 丢弃，无序号则靠合法转换约束。                         | sequence 跨重连吗？      | Lamport clock、版本号          |
|   6 | 重复挂断为何不报错？                     | 对外控制 API 采用幂等语义；终态重复命令直接返回，减少调用方竞态负担。                           | 哪些操作不能幂等？       | `CallSession.command`          |
|   7 | destroy during init 怎么办？             | init 共享作用域 AbortSignal；destroy abort 后，任何晚到结果都不能进入 ready。                   | 不支持 Abort 的依赖呢？  | `ResourceScope`；取消传播      |
|   8 | 为什么销毁后不能重新 init？              | 防止旧监听器、请求、序列与新一代实例混合；新建实例的成本可控。                                  | 如何平滑换账号？         | 实例代际、所有权               |
|   9 | 多实例如何隔离？                         | 每实例独立 calls、bus、seen set、scope 和 adapters；不使用模块级可变单例。                      | 可共享一个 socket 吗？   | `sdk.ts`；隔离/复用            |
|  10 | 事件总线为什么返回 unsubscribe？         | 订阅者显式交还资源所有权，Scope/框架卸载时可确定释放。                                          | WeakRef 可否替代？       | `event-bus.ts`；观察者模式     |
|  11 | WebSocket 能保证恰好一次吗？             | 不能；断线边界无法判断服务端是否处理，需 idempotency key、去重与状态核对。                      | 至少一次如何实现？       | 分布式投递语义                 |
|  12 | 为什么不能自动重放 hangup？              | 结果未知的非幂等指令可能重复执行或作用于错误会话，必须先同步服务端状态。                        | ping 能重放吗？          | `ConnectionManager.send`       |
|  13 | full jitter 有什么价值？                 | 将指数退避窗口内的客户端重连打散，避免服务恢复时惊群。                                          | decorrelated jitter 呢？ | 指数退避、随机抖动             |
|  14 | 心跳和 TCP keepalive 有何不同？          | 应用心跳验证端到端业务通道与代理链路，TCP keepalive 粒度和语义都不足。                          | 页面后台节流怎么办？     | Page Visibility、心跳          |
|  15 | 请求如何关联响应？                       | 请求 id 作为 correlationId，pending map 保存 resolve、reject 和 timeout。                       | 过期响应怎么处理？       | `connection-manager.ts`        |
|  16 | 去重集合会无限增长吗？                   | 当前实现限制 1000 条作为样例；生产应使用按会话/时间窗口 LRU。                                   | 窗口多大？               | 有界缓存、TTL                  |
|  17 | 重连后为何还要状态同步？                 | transport connected 只说明通道恢复，离线期间业务状态可能变化，需拉快照再合并。                  | 如何处理快照/增量缝隙？  | snapshot + sequence            |
|  18 | getUserMedia 何时调用？                  | 需要媒体时调用而非 SDK init；降低权限打扰，远端接通时先获取再进入 active。                      | 呼入预热呢？             | 权限 UX、媒体生命周期          |
|  19 | 轨道为什么必须 stop？                    | 删除引用不会关闭设备；必须逐 track stop 才释放麦克风和隐私指示。                                | replaceTrack 呢？        | `BrowserMediaManager.release`  |
|  20 | 设备切换如何做？                         | 输入端新建 track 后 `replaceTrack`，输出端能力检测 `setSinkId`；失败保持旧设备。                | Safari 支持差异？        | MediaDevices、兼容检测         |
|  21 | 标签页后台有什么风险？                   | timer 降频影响心跳/计时；通话时长应由时间戳计算，不能依赖 interval 累加。                       | 如何检测冻结？           | Visibility API、单调时间       |
|  22 | 远端音频为何可能播不出来？               | autoplay policy 需要用户激活；应暴露 blocked 状态并引导点击恢复。                               | 如何保存激活？           | HTMLMediaElement.play          |
|  23 | getStats 采哪些指标？                    | RTT、jitter、packet loss、concealed samples、码率，并按窗口聚合。                               | 阈值怎么定？             | WebRTC stats、MOS              |
|  24 | STUN 和 TURN 的区别？                    | STUN 发现公网映射；TURN 在直连失败时中继媒体，是企业网络可用性的必要保障。                      | 凭证如何下发？           | ICE、临时凭证                  |
|  25 | SIP 凭证为何不能写前端？                 | 静态凭证可被任何用户提取；应由后端鉴权后签发短期、最小权限凭证。                                | 如何刷新？               | 零信任、短期 token             |
|  26 | HostAdapter 解决什么问题？               | 把用户、鉴权、导航、埋点和业务上下文交给宿主，Core 不反向依赖 CRM。                             | adapter 抛错怎么办？     | `HostAdapter`；端口适配器      |
|  27 | React 绑定为何用 external store？        | SDK 是 React 外部状态源；订阅模型能兼容并发渲染与一致快照。                                     | 快照引用要稳定吗？       | useSyncExternalStore           |
|  28 | 高频事件如何避免重渲染？                 | 订阅细粒度 call、缓存快照，质量指标节流/批处理，不把原始 stats 全灌入全局状态。                 | 频率多少合适？           | selector、节流                 |
|  29 | Vue 绑定为何用 shallowRef？              | 快照已经不可变，无需深层代理，可减少大对象响应式开销。                                          | readonly 有何作用？      | `vue/index.ts`                 |
|  30 | iframe 为什么同时校验 origin 和 source？ | origin 防其他站点，source 防同源其他窗口伪造；二者缺一都扩大攻击面。                            | sandbox 属性呢？         | `iframe/index.ts`；postMessage |
|  31 | 为什么禁止 `*` targetOrigin？            | 敏感的号码、客户上下文和控制响应可能发给错误导航后的窗口。                                      | origin 动态变化呢？      | 同源策略                       |
|  32 | iframe ready handshake 有何意义？        | 避免宿主在子页监听器安装前发请求丢失，并协商协议版本/能力。                                     | 版本不兼容怎么办？       | 握手、能力协商                 |
|  33 | requestId 为什么必需？                   | 并发 RPC 的响应可能乱序，requestId 将响应精确归属并支持超时清理。                               | 如何防重放？             | RPC、nonce                     |
|  34 | 为什么 strict 还不够？                   | `exactOptionalPropertyTypes`、`noUncheckedIndexedAccess` 继续消除协议缺字段和索引越界的模糊性。 | 代价是什么？             | `tsconfig.base.json`           |
|  35 | discriminated union 的优势？             | switch 后 payload 自动收窄，新增事件能通过 exhaustive check 暴露遗漏。                          | 如何生成协议类型？       | TypeScript narrowing           |
|  36 | SDK 错误如何设计？                       | 稳定 code 供程序判断，message 给开发者，cause 保留底层错误；不依赖字符串分支。                  | 可重试性放哪里？         | `CloudCallError`               |
|  37 | Promise API 的失败语义？                 | 命令被本地接受不等于远端生效；真实 adapter 应区分发送失败、确认超时和业务拒绝。                 | 如何表示 unknown？       | Result、错误分类               |
|  38 | 同会话命令为何串行化？                   | 避免 hold/resume/hangup 交叉执行导致本地顺序与发出顺序不一致。                                  | 多会话会互相阻塞吗？     | `CallSession.enqueue`          |
|  39 | timeout 属于谁？                         | 连接请求 timeout 属于 transport；振铃业务 timeout 属于 Core；UI 只展示。                        | 服务端 timeout 呢？      | 分层超时                       |
|  40 | 为什么 UI 不直接改状态？                 | UI 只能发意图，真实状态由 Core 合并本地和远端事件，保证所有宿主一致。                           | 乐观更新呢？             | 单向数据流                     |
|  41 | Tree Shaking 需要什么条件？              | ESM、静态导入、正确 sideEffects 标记和框架依赖外置；最后以产物分析验证。                        | CSS 怎么处理？           | package.json exports           |
|  42 | source map 如何取舍？                    | 私有部署可输出并受控上传；公开包可提供独立 map，避免线上直接暴露源代码策略冲突。                | 错误映射怎么做？         | sourcemap、安全                |
|  43 | benchmark 如何可信？                     | 固定 Node/硬件/命令，保留原始输出，多轮统计并区分 microbenchmark 与用户体验。                   | warmup 如何处理？        | `call-machine.bench.ts`        |
|  44 | 为什么不写“优化 80%”？                   | 没有真实前后基线就属于编造；当前只提供可重复基准入口，数据运行后记录。                          | 应记录哪些环境？         | 科学测量                       |
|  45 | 状态机测什么最值钱？                     | 非法转换、终态幂等、乱序、并发意图与失败路径，比单纯 happy path 更有价值。                      | 如何模型测试？           | `call-machine.test.ts`         |
|  46 | Mock 如何避免失真？                      | 只替换边界，核心状态和事件链不替换；故障可配置，并维护明确能力矩阵。                            | contract test 怎么写？   | `MockTransport`                |
|  47 | E2E 应覆盖多少？                         | 少量高价值用户旅程；组合和竞态留给更快、更确定的单元/契约测试。                                 | 网络故障 E2E 呢？        | `playground.spec.ts`           |
|  48 | 100 次压力测试能证明无泄漏吗？           | 只能证明可观测资源计数不增长，不能替代浏览器 heap/track/socket 实测，结论必须克制。             | 如何做 heap diff？       | `stress.test.ts`               |
|  49 | 模块边界如何自动检查？                   | 通过 workspace 依赖方向、TS references、ESLint import 规则或 dependency-cruiser 阻断环。        | 当前缺什么？             | Monorepo DAG                   |
|  50 | 上线前还缺什么？                         | 真实 SIP adapter、重连快照协议、ICE/TURN 真机矩阵、安全评审、可观测性和合规验证。               | 如何分阶段灰度？         | `capability-matrix.md`         |
