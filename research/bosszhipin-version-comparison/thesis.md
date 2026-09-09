# Thesis

## Central Thesis

For the user's stated goal of continuing the existing local project, the local/fork line is the better product fit because it is deterministic, lighter, and already matches the user's profile-driven fixed-greeting workflow. It is not the safer operational baseline as-is: upstream `master` contains later BOSS browser compatibility and startup robustness fixes that the local line lacks.

The practical choice is to keep the local/fork behavior as the base and port the small, targeted upstream browser fixes before sending real messages. Switching wholesale to upstream is justified only if LLM-generated greetings, resume parsing, vector retrieval, and the newer multi-page GUI are desired.

## Common Misreading

“The upstream version is newer, so it is automatically better.” Newer commits matter for BOSS UI compatibility, but upstream also changes the product contract from fixed local rules to an LLM/RAG workflow. A version can be newer and still be a worse fit for a user who wants no API key, deterministic output, and local review.

## Supporting Evidence

1. The local dependency graph and send path are materially smaller and explicitly reject LLM/RAG configuration.
2. The local GUI and tests are centered on YAML profiles, local matching, review decisions, dry-run, and fixed greeting audit records.
3. Upstream adds the August 2026 `继续沟通` dialog handling, send-button click fallback, optional resume sending, proxy/CDP handling, sandbox control, and real-card readiness checks.

## Counterargument

The upstream project is the better base if the immediate priority is current BOSS compatibility or LLM-assisted application generation. Porting fixes into the fork creates a maintenance obligation and can introduce behavior mismatches between the fork's longer custom send loop and upstream's newer shorter loop.

## Conditions

This judgment changes if the user confirms that their BOSS account still uses the old dialog and Enter-to-send behavior, or if they specifically want LLM/RAG features. It also requires re-evaluation after a live dry-run because BOSS UI rollout can vary by account.

## Unproven

The repository comparison proves code and history differences. It does not prove that either version can safely send messages on the user's current account without a live, low-volume dry-run.
