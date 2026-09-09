# Source State

- Commit: `c72c509d082fbfdf8e0051a30ba986ddeda886a1` (local/fork); comparison commit `d797cdeede941cae502c09555206fa051c17fbbe` (upstream)
- Research date: 2026-09-07

## Repositories

- Local path: `D:\boss自动化投递`
- Local branch: `main`
- Local commit: `c72c509d082fbfdf8e0051a30ba986ddeda886a1` (2026-07-05)
- Local `origin`: `https://github.com/4evour/Bosszhipin-job-bot.git`
- Fork `main`: `c72c509d082fbfdf8e0051a30ba986ddeda886a1`
- Upstream: `https://github.com/longsizhuo/BossZhiPin_Job_Search.git`
- Upstream default branch: `master`
- Upstream comparison commit: `d797cdeede941cae502c09555206fa051c17fbbe` (2026-08-15)
- Comparison date: 2026-09-07, Asia/Shanghai

The GitHub API reports `4evour/Bosszhipin-job-bot` as `fork: false`; it is a separate repository rather than a GitHub fork relationship. Git history shows both repositories share base `8ac3544a8c6ce2f3792d02ade5a5cf939d2b50a5`.

## Working tree

The worktree is not clean. Existing user changes are preserved and were not inspected for content:

- Modified: `greetings/default.txt`
- Modified by this follow-up: `src/boss_zhipin/website_oper/finding_jobs.py`, `src/boss_zhipin/website_oper/write_response.py`, `tests/test_finding_jobs_text.py`
- Untracked: `profiles/111.yml`
- Untracked from the earlier comparison: `research/bosszhipin-version-comparison/`

No merge, checkout, reset, or file overwrite was performed.

The comparison claims below describe the pre-follow-up snapshot. The upstream BOSS 2026-08 send-flow patch was ported into the local worktree after that snapshot.

## System map

- Languages: Python, TypeScript, Rust/Tauri.
- Local entrypoints: `uv run python -m boss_zhipin.tauri`, `uv run main.py`, and the installed `boss-zhipin` script.
- Local model: profile-driven local keyword filtering, fixed greeting, scan/review/auto modes, JSONL audit logs, and a Tauri dashboard.
- Upstream model: browser automation plus resume extraction/vector retrieval and OpenAI-compatible LLM matching and greeting generation, with Tauri Config/Run/History pages.
- Shared browser dependency: `nodriver>=0.48.1`.
- Local direct dependencies: `python-dotenv`, `PyYAML`, and `nodriver`; Tauri dependencies are in the `tauri` dependency group.
- Upstream direct dependencies additionally include `openai`, `pypdf`, `chromadb`, and `sentence-transformers`.

## Scope

This comparison answers which code line is a better base for continued use, with emphasis on behavior, browser compatibility, dependencies, GUI, tests, and maintenance state. It does not verify account safety, BOSS terms-of-service compliance, or a live end-to-end send against a real account.
