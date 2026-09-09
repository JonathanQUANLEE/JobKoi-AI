# Wiki 总入口

## 主题文档

- [架构总览](architecture.md) —— 数据流、模块边界、关键抽象
- [常见故障排查](troubleshooting.md) —— Chrome 闪退 / 反爬触发 / 卡登录页 等
- [FAQ](faq.md) —— 固定招呼语、岗位规则、运行模式相关的常见问题

## Architecture Decision Records (ADR)

记录"为什么这么做"和"考虑过什么但没采纳"。读 ADR 比读 commit message 更快搞清
楚一个设计的来龙去脉。

- [ADR-001 用 nodriver 替代 Selenium / undetected-chromedriver](adr/001-nodriver-over-selenium.md)
- [ADR-002 旧 LLM provider 设计已废弃](adr/002-three-providers.md)
- [ADR-003 旧 LLM telemetry 设计，0.2 已移除](adr/003-telemetry-separate.md)
- [ADR-004 持久化 Chrome profile 而不是 mock 登录态](adr/004-persistent-chrome-profile.md)
- [ADR-005 pytauri standalone 打独立 .app，双运行模式并存](adr/005-pytauri-standalone.md)

## 怎么继续读

- 第一次看本项目 → `architecture.md`
- 跑起来卡住 → `troubleshooting.md`
- 想动代码前 → 主目录 [CLAUDE.md](../../CLAUDE.md) + [CONTRIBUTING.md](../../CONTRIBUTING.md)
- 觉得某个设计奇怪 → 对应 ADR
