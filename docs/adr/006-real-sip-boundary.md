# ADR-006：真实 SIP/WebRTC 作为显式适配器边界

状态：Accepted。

仓库不绑定未经验证的 PBX，也不提供假凭证。未来 `SipJsTransport` 应实现 `SignalingTransport`，负责 SIP.js UserAgent/Inviter/Invitation 到领域事件的映射；`PeerMediaAdapter` 负责 RTCPeerConnection、ICE 和 getStats。适配器集成测试需要专用 WSS SIP 测试环境，不能由 Mock 测试替代。
