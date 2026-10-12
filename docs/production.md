# 真实通话部署与验收

当前代码实现 SIP.js 浏览器适配器、远端音频播放、单通话、静音、保持/恢复和 RTP DTMF；生产构建默认进入真实模式。转接尚未开放。Mock 和单元测试不能证明真实 PBX 或手机线路已接通。

## 必须准备的资源

- Linux 公网服务器，支持的 Asterisk 版本和 coturn。可分开部署。
- `call`、`pbx`、`turn` 域名及有效 TLS 证书。
- 两个受限的 SIP 分机和各自随机密码。
- 手机外呼需额外开通 SIP Trunk/云通信线路和批准的主叫号码。没有线路时只能分机互拨。

官方参考：[Asterisk WebRTC 配置](https://docs.asterisk.org/Configuration/WebRTC/Configuring-Asterisk-for-WebRTC-Clients/)、[SIP.js 媒体接入](https://sipjs.com/guides/attach-media/)、[coturn](https://github.com/coturn/coturn)。

## 1. PBX 和 TURN

安装 Asterisk 与 coturn，参考 `deploy/asterisk/*.example` 和 `deploy/turnserver.conf.example` 合并配置。模板不是完整生产服务器镜像，需替换密码、域名、证书及公网/NAT 地址；按实际安装版本检查模块和配置。Asterisk 需要 PJSIP、WebSocket、HTTP、WebRTC/DTLS-SRTP 支持。Opus 不可用时保留 ulaw/alaw，并验证与线路的编解码兼容性。

开放 HTTPS 443、PBX WSS 8089/TCP、PBX RTP 10000–20000/UDP、TURN 3478/TCP+UDP、5349/TCP 和 TURN 中继 49160–49260/UDP。SIP Trunk 端口和来源按供应商配置，仅允许供应商地址。TURN 的 peer 出口只允许 PBX 的媒体地址，防止被用于访问内部网络。不要开放管理端口。

同一分机只允许一个浏览器注册，避免来电同时落到多个页面。用 `asterisk -rx 'pjsip show endpoints'` 检查分机。证书更新后让服务加载新证书。

## 2. 登录与分机配置

复制 `deploy/.env.example` 到 `deploy/.env`，填写真实域名、WSS 地址和 TURN 配置。TURN_SECRET 必须与 coturn `static-auth-secret` 一致；使用随机高强度值。

创建 `deploy/secrets/users.json`，按 `deploy/users.example.json` 配置用户。每个登录账号只关联自己的受限 SIP 分机。登录密码的 scrypt 哈希使用：

```bash
read -rs -p 'Login password: ' CALL_PASSWORD
printf '%s' "$CALL_PASSWORD" | node server/hash-password.mjs
unset CALL_PASSWORD
```

把输出填入 `passwordHash`。登录密码和分机密码是两套凭证。限制 secrets 文件权限，不要提交 Git。

后端使用 Secure/HttpOnly/SameSite Cookie，检查 POST Origin，限制登录速率，不缓存凭证响应。会话存于内存，重启后需重新登录；多实例部署前需改用共享会话和限流存储。API 不发布宿主端口，只通过同源 HTTPS 代理访问。代理 IP 限流是单实例整体限流，另有每账号限流。

**凭证边界：** 当前 PBX 使用独立分机的 SIP digest 密码，认证后必须交给 SIP.js 使用，它不是短期 SIP 凭证。密码不写入前端构建、不存 localStorage、关闭 SIP 原始日志。TURN 凭证有效一小时，每次拨号或接听都会重新检查后端登录并获取新 TURN 凭证，分机身份发生变化时要求重新连接。浏览器会话到期不会自动撤销已经取得的 SIP 密码；账号停用或凭证泄露须在 PBX 同步停用/轮换并终止会话。需要严格短期授权时，应接入支持临时 SIP 账号的供应商或 PBX 动态账号系统。

## 3. 部署网页和 API

在仓库根目录执行：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

Caddy 自动申请网页证书；确保域名指向服务器并开放 80/443。PBX/TURN 证书需另外配置。`/api/health` 只检查 API 进程，不表示 PBX 或电话线路正常。

本地 `pnpm dev` 保留 Mock。开发真实模式可以配置 `VITE_CALL_MODE=sip`，但后端使用安全 Cookie，需要本地 HTTPS 同源代理。普通生产 `pnpm build` 为真实模式；`--mode demo` 或 `VITE_CALL_MODE=mock` 仅用于演示，不能作为生产上线验收。

## 4. 外线

取得供应商 trunk 配置后，在 PBX 配置 endpoint/auth/aor/registration（按实际认证方式）、批准主叫号码和线路并发限制。默认分机 context 仅允许内部号码；只对获授权分机开放外线 context，限制目标号码和费用。

`extensions.conf.example` 中保留了关闭状态的示例路由：拨 `9 + 手机号` 时去掉 9 发给 trunk。按供应商号码格式修改后才能启用。呼入需供应商提供 DID，限制 trunk 来源并映射到分机。前端号码校验不能代替 PBX 外呼权限控制。

## 5. 上线验收

1. 两个账号分别在两台设备登录，看到分机已注册。
2. 拨 1001/1002，接听后双方声音清晰；任意方挂断，两边结束且麦克风停止。
3. 两台设备分别使用不同网络，验证 TURN；用浏览器 WebRTC 调试页确认 ICE 候选与音频包，不只观察页面状态。
4. 验证拒接、忙线、无人接听、麦克风拒绝、静音、保持/恢复、DTMF；被阻止自动播放时点击“播放通话声音”。
5. 断开信令，页面停止允许新拨号；点击“重新连接”后取得新配置并重新注册。当前不声称无缝恢复掉线通话。
6. 验证未登录获取配置返回 401、跨源 POST 返回 403、错误密码不泄露账号信息，登出后配置不可访问。
7. 外线开通后验证真实手机拨出、呼入、主叫显示、双向音频、挂断及供应商计费记录。经授权测试少量号码。

这些真实网络验收必须在实际服务器及已开通线路上执行。仓库检查通过不等于完成生产通话验收。
