# ADR-006：真实 SIP/WebRTC 作为显式适配器边界

状态：Accepted。

仓库不绑定未经验证的 PBX，也不提供假凭证。`SipTransport` 实现 `SignalingTransport` 和 `MediaAdapter`，负责 SIP.js UserAgent/Inviter/Invitation 到领域事件的映射；同一实例管理音频，避免重复采集麦克风。SIP.js 内部管理 RTCPeerConnection 和 ICE。默认单通话，转接尚未开放。适配器契约测试不能替代专用 WSS SIP 环境的真实集成测试。部署与凭证限制见 `docs/production.md`。
