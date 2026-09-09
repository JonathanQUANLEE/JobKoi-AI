# ADR-003：旧 LLM telemetry 设计已移除

- **状态**：Deprecated
- **日期**：2026-06-30
- **取代原因**：0.2 删除 LLM 调用链路，不再需要 token、成本、provider 延迟等 telemetry。

## 背景

旧版本曾经把 LLM 调用指标单独写入 `logs/llm_calls.jsonl`，用于统计不同 provider 的调用成本、延迟和 token 数。

## 当前决策

0.2 只使用用户固定招呼语和本地规则，不调用 LLM。因此：

- 删除 `audit/telemetry.py`。
- 删除 provider 成本统计。
- 删除历史页和复杂诊断里依赖 telemetry 的入口。
- 保留 `logs/letters.jsonl` 作为固定招呼语校验和发送审计。

## 影响

当前日志重点从“AI 调用成本”转为“岗位处理状态”：

| 文件 | 内容 |
|---|---|
| `logs/scan_matches.jsonl` | 扫描命中的岗位 |
| `logs/seen_jobs.jsonl` | 已看过岗位 |
| `logs/sent_jobs.jsonl` | scan / dry-run / 已发送记录 |
| `logs/skipped_jobs.jsonl` | 跳过原因 |
| `logs/letters.jsonl` | 固定招呼语校验和发送审计 |

如果未来重新引入远程调用指标，需要写新的 ADR，并明确它和固定招呼语流程的关系。
