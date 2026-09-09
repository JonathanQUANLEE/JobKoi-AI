# Evidence Map

## Source State

- Local/fork `main` and local `HEAD` are the same commit `c72c509`; local has two uncommitted user changes.
- Upstream `master` is `d797cde`, 30 commits on the upstream-only side of the common base; the fork has its own GUI/profile commits.
- The fork's latest pushed commit is 2026-07-05. Upstream's compared `master` commit is 2026-08-15.

## README Reuse Map

| README material | Classification | Reason |
|---|---|---|
| Local project is fixed-greeting and local-rule focused | reuse | Matches `pyproject.toml`, `cli.py`, `filter_rules.py`, and `write_response.py`. |
| Upstream project supports LLM-generated greetings and multiple OpenAI-compatible endpoints | verify | README intent is confirmed by upstream dependencies and `models/llm.py`, but runtime provider behavior was not live-tested here. |
| Local project has scan/review/auto modes and safety limits | reuse | Confirmed by profile loading, mode checks, send loop, and tests. |
| Either project is currently production-safe against BOSS UI changes | exclude | No live browser E2E evidence; upstream has a newer selector patch and local lacks it. |

## Official Claims

- The local README says the project intentionally removed LLM, resume parsing, RAG, vector storage, and provider configuration.
- The upstream README says the project generates greetings with an LLM and uses resume retrieval before generation.
- The upstream changelog/commit history records fixes for the August 2026 BOSS greeting dialog and send-button behavior.

These are project claims and repository history, not an independent guarantee of successful sending.

## Architecture

Local flow:

```text
GUI or CLI profile -> environment bridge -> BOSS browser automation
-> local structured filter -> scan/review/fixed greeting
-> send or dry-run -> JSONL audit/state logs
```

Upstream flow:

```text
GUI or CLI config -> BOSS browser automation -> resume extraction/vector retrieval
-> keyword/LLM job match -> LLM greeting -> audit validation
-> chat send/resume action -> JSONL telemetry/history
```

The local flow has fewer services and fewer failure surfaces. The upstream flow has more automation capability but adds model, embedding, resume, and provider failure surfaces.

## Code Evidence

### EV-001 - Local fixed-greeting workflow

- Path: `src/boss_zhipin/website_oper/write_response.py`
- Symbol: `send_job_descriptions_to_chat`
- Observation: The local loop reads profile filters, supports scan/review/auto modes, validates a fixed greeting, enforces send limits, and writes state/audit records.
- Meaning: The fork is a deliberate workflow redesign, not merely a stale copy of the upstream UI.
- Alternative explanation: Some behavior is still bridged through environment variables, so the GUI and core loop remain coupled through compatibility configuration.
- Confidence: high

### EV-002 - Local profile and GUI surface

- Paths: `src/boss_zhipin/config/profiles.py`, `src/boss_zhipin/config/filter_rules.py`, `tauri-ui/src/pages/Dashboard.tsx`
- Observation: YAML profiles support inheritance and local filter scopes; the single dashboard exposes profile, filter, greeting, dry-run, review, and auto-run controls.
- Meaning: The local version is a better fit when the user wants deterministic, reviewable, no-API-key operation.
- Alternative explanation: The single-page dashboard is less separated than the upstream Config/Run/History layout.
- Confidence: high

### EV-003 - Local browser-send behavior in the comparison snapshot was behind the upstream August patch

- Paths: `src/boss_zhipin/website_oper/finding_jobs.py:921`, `src/boss_zhipin/website_oper/finding_jobs.py:948`, `src/boss_zhipin/website_oper/write_response.py:686`
- Observation: Local code looks for `留在此页` after `立即沟通` and sends chat text with Enter. The upstream commit `e4b9062` adds `dismiss_greeting_dialog` for `继续沟通`, makes the send button primary with Enter fallback, and adds optional `发简历`.
- Meaning: With the August 2026 BOSS behavior described by the upstream fix, the pre-follow-up local snapshot could stop at the dialog or fail to submit the typed message. This follow-up ported the dialog, send-button, and optional resume actions into the local worktree.
- Alternative explanation: BOSS may serve different UI variants by account, region, or rollout cohort; only a live account test can confirm the exact path.
- Confidence: high for code difference, medium for the live impact.

### EV-004 - Upstream added browser robustness after the fork diverged

- Path: upstream `src/boss_zhipin/website_oper/finding_jobs.py` at `d797cde`
- Observation: Upstream includes `BOSS_NO_SANDBOX`, proxy bypass handling for local CDP, real-job-card readiness checks, and safer reload/evaluation paths. The local tree does not contain these symbols.
- Meaning: Upstream is operationally ahead for several startup and page-render failure cases.
- Alternative explanation: The local implementation has different JavaScript scrolling and state handling that may solve some cases through another path.
- Confidence: medium-high

### EV-005 - Dependency and capability split

- Paths: local `pyproject.toml`; upstream `pyproject.toml` at `d797cde`
- Observation: Local direct dependencies are `python-dotenv`, `PyYAML`, and `nodriver`; upstream additionally declares `openai`, `pypdf`, `chromadb`, and `sentence-transformers`.
- Meaning: Local setup is lighter and avoids API keys/model downloads; upstream supports generated greetings and semantic resume matching at higher cost and complexity.
- Alternative explanation: A lighter dependency graph can also mean fewer built-in capabilities rather than strictly better engineering.
- Confidence: high

### EV-006 - Verification evidence

- Command: `uv run pytest -q`
- Observation: Local result was `190 passed, 1 skipped, 1 warning`; the warning is an un-awaited coroutine in `tests/test_runner.py::test_start_twice_raises`.
- Command: `pnpm --dir tauri-ui build`
- Observation: Local TypeScript check and Vite production build passed.
- Meaning: The local snapshot is internally testable and buildable, but these checks do not exercise a real BOSS session.
- Confidence: high

## Engineering Evidence

- Local has a substantial focused test suite for profiles, filtering, GUI IPC, run state, review/send flow, retries, and text parsing.
- Upstream has tests for newer LLM, telemetry, vectorization, diagnostics, resume handling, page rendering, proxy, sandbox, and send-flow fixes.
- Neither repository evidence reviewed here constitutes a live browser compatibility test against the current BOSS site.

## Limitations

- No real BOSS login, page scan, dialog interaction, or message send was executed.
- Upstream tests were inspected from the fixed commit but not run in a separate checkout.
- The local async warning was recorded but not fixed because this task was comparison-only.
- Account risk and BOSS policy compliance are outside the evidence available from source comparison.

## Contradictions

- Local README presents the project as a safer, more controllable fixed-greeting workflow, which is supported by the local code, but local browser selectors do not include the upstream August 2026 send-button/dialog adaptation.
- Upstream has newer browser fixes, but its richer LLM/RAG path introduces API, model-download, provider, and resume-data dependencies that are unnecessary for a fixed-greeting workflow.

## Open Questions

- Which BOSS UI variant is currently shown by the user's account?
- Does the user need fixed greetings or LLM-generated greetings?
- Should the local branch receive only the upstream browser fixes, or also upstream robustness patches?
