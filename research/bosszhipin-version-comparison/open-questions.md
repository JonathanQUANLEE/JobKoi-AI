# Open Questions

1. Run a BOSS `scan` or dry-run with no real send and record whether the account shows `留在此页` or `继续沟通` after `立即沟通`.
2. Confirm whether the desired output is a user-written fixed greeting or an LLM-generated greeting based on the resume.
3. Decide whether to port only upstream `e4b9062` send-flow changes or also the upstream real-card, proxy, sandbox, and sent-recording fixes.
4. Inspect the user's untracked `profiles/111.yml` locally before any cleanup or merge decision; it was intentionally not read during this comparison.
5. Fix or explicitly accept the un-awaited coroutine warning in `tests/test_runner.py::test_start_twice_raises` before treating the local branch as warning-free.
