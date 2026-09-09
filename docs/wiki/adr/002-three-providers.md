# ADR-002：旧 LLM provider 设计已废弃

- **状态**：Deprecated
- **日期**：2026-06-30
- **取代原因**：0.2 版本删除 LLM 生成招呼语、简历解析、RAG、向量库和 provider 配置。

## 背景

旧项目曾经支持通过 OpenAI 兼容端点生成招呼语，并围绕不同 provider 维护 API key、base URL、模型名、成本统计和诊断说明。

## 当前决策

0.2 不再保留这条能力。项目只发送用户自己填写的固定招呼语，岗位匹配由本地规则完成。

删除范围：

- LLM client。
- provider 预设和端点选择。
- 简历解析。
- RAG 和向量库。
- LLM telemetry。
- GUI 中的 API key、base URL、model 配置入口。

## 影响

- 用户不再需要申请或填写任何 AI API key。
- README、`.env.example` 和 GUI 不再介绍 provider。
- 旧 provider 相关测试和依赖已删除。
- 如果未来重新引入 AI 能力，需要重新写新的 ADR，不能复活旧实现作为默认路径。

## 保留的历史价值

这个 ADR 保留为迁移记录：它解释为什么仓库历史里曾经出现 `LLM_*`、provider、向量库和 telemetry 文件，也说明这些内容在 0.2 中不再是当前架构的一部分。
