# Comparison Matrix

| Dimension | Local/fork `c72c509` | Upstream `master` `d797cde` | Decision impact |
|---|---|---|---|
| Main abstraction | Profile-driven local filter plus fixed greeting | Job match plus generated greeting using resume/LLM context | Choose local for deterministic control; upstream for assisted generation. |
| Data model | YAML profiles, structured jobs, JSONL state/audit logs | Environment/config, resume text/vector store, structured jobs, telemetry/history | Upstream stores and processes more derived data. |
| Update model | Local profile inheritance and GUI-to-profile persistence | GUI config/run/history plus environment-backed provider settings | Local is simpler to operate; upstream has more configuration surface. |
| Retrieval and delivery | Local keyword/regex/exact matching, scan/review/auto, fixed greeting | Resume vector retrieval plus keyword/LLM match, generated greeting, chat and optional resume send | Upstream is more capable but less deterministic and more expensive. |
| Governance | Dry-run, review gate, send caps, captcha stop, audit logs | Dry-run, validation/audit, telemetry, send caps, diagnostics, provider config | Both have controls; local controls are closer to the user's fixed-message workflow. |
| Coupling | Python/Tauri plus browser and YAML files | Python/Tauri plus browser, LLM endpoint, embedding model, PDF parser, Chroma | Local has fewer operational failure points. |
| Browser compatibility | Older dialog/Enter send path; local has no August upstream patch | August 2026 dialog, send-button, resume-click, proxy, sandbox, real-card readiness fixes | Upstream currently has the stronger baseline for real BOSS UI changes. |
| Verification | 190 passed, 1 skipped, 1 warning; frontend build passed | Newer tests include LLM, vector, telemetry, diagnostics, rendering, and latest send-flow cases; not run here | Upstream has broader newer coverage; local has strong coverage for its own workflow. |
| Operational cost | No API key or embedding model required | API key/model endpoint plus embedding download and vector storage | Local is preferable for low setup and predictable cost. |
