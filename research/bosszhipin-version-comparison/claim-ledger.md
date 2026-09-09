# Claim Ledger

| ID | Type | Claim | Evidence | Confidence | Article Location |
|---|---|---|---|---|---|
| C-001 | FACT | Local `HEAD` and fork `origin/main` both point to `c72c509`. | `git status --branch`; `git remote -v`; `git ls-remote origin` | high | Source State |
| C-002 | FACT | Local worktree has a modified greeting file and untracked profile file. | `git status --short` | high | Source State |
| C-003 | FACT | Upstream `master` comparison commit is `d797cde`, dated 2026-08-15; local/fork commit is dated 2026-07-05. | `git show -s`; `git ls-remote` | high | Source State |
| C-004 | FACT | Local and upstream share base `8ac3544`; fork-only history contains the profile/GUI redesign while upstream-only history contains later LLM and browser fixes. | `git merge-base`; `git log --left-right --cherry-pick` | high | Architecture |
| C-005 | FACT | Local direct dependencies omit OpenAI, PDF, Chroma, and sentence-transformers dependencies present upstream. | local and upstream `pyproject.toml` | high | Comparison |
| C-006 | FACT | In the pre-follow-up snapshot, local send path searched for `留在此页` and pressed Enter; upstream `e4b9062` handled `继续沟通`, clicked `发送`, and optionally clicked `发简历`. The follow-up ported these actions locally. | pre-follow-up local `finding_jobs.py`/`write_response.py`; upstream commit `e4b9062`; current local diff | high | Browser Compatibility |
| C-007 | FACT | Local tests pass with `190 passed, 1 skipped, 1 warning`, and the frontend build passes. | `uv run pytest -q`; `pnpm --dir tauri-ui build` on 2026-09-07 | high | Verification |
| C-008 | INFERENCE | Local is the better functional fit for deterministic fixed-greeting use, while upstream is ahead on current browser compatibility. | C-005, C-006, local GUI/profile evidence, upstream history | medium-high | Thesis |
| C-009 | OPINION | Keep local/fork as the base and port targeted upstream browser fixes before real sending. | Engineering judgment based on C-005 through C-008 | medium | Recommendation |
| C-010 | OPEN | Whether the user's account currently shows the upstream August dialog and send-button behavior. | Requires live dry-run observation | unresolved | Limitations |
