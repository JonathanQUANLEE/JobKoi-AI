# Bosszhipin Job Bot

[中文](README.md) · [English](README_EN.md)

A personal BOSS Zhipin job-search helper. Since version 0.2, the GUI is the main entry point and the CLI is kept for advanced users and tests.

This project:

- Opens BOSS Zhipin with a dedicated Chrome profile.
- Filters jobs with local keyword rules.
- Uses your fixed greeting in `scan`, `review`, or `auto` mode.

It no longer provides LLM-generated greetings, resume parsing, RAG, vector stores, or provider configuration. No AI API key is required.

## Disclaimer

- This is a free open-source personal tool under the [MIT License](LICENSE).
- Browser automation against BOSS Zhipin may violate its terms. Account risk and all consequences are your responsibility.
- Use it only for personal job seeking. Do not use it for high-frequency spam or harassment.

## Quick Start

```bash
git clone https://github.com/4evour/Bosszhipin-job-bot.git
cd Bosszhipin-job-bot
uv sync
cp .env.example .env
uv run python -m boss_zhipin.tauri
```

The first run opens Chrome with `./chrome_profile/`. Scan the QR code once; later runs reuse the saved login state.

For the GUI workflow, click **Open manual browser** first, log in and apply any BOSS page filters in Chrome, then return to the GUI and click **Start**. The GUI reuses the current controlled page; it does not automatically navigate to `BOSS_START_URL` or click profile page filters. Use the CLI with a profile when you want those settings applied automatically.

## Modes

| Mode | Behavior |
|---|---|
| `scan` | Scan and log matched jobs only |
| `review` | Show each matched job and send only after confirmation |
| `auto` | Send your fixed greeting after a match, with random delay throttling |

Start with `scan`, move to `review`, and only use `auto` after your rules are stable.

## CLI

```bash
uv run main.py --profile backend-intern
uv run main.py --profile ai-intern
```

Profiles live in `profiles/` and support inheritance.

Do not commit personal job criteria, greetings, or private profiles. Keep personal profile files local and commit only sanitized examples.

## Verification

```bash
uv run pytest -q
pnpm --dir tauri-ui build
```
