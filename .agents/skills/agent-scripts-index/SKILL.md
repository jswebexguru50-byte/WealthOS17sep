---
name: agent-scripts-index
description: "Browse and use the steipete/agent-scripts skill library. Use when you need browser automation, GitHub triage, release workflows, Mac tools, frontend design, Cloudflare, or any of the 53 other shared agent skills wired into this project."
---

# agent-scripts skills

Cloned from `steipete/agent-scripts` into `vendor/agent-scripts/`.  
Skills are wired via directory junctions into `.agents/skills/<name>/`.  
Resources (docs, scripts, hooks) live at `.agents/agent-scripts-resources/`.  
Shared hard rules: `vendor/agent-scripts/AGENTS.MD`.

## How to use a skill

1. Read the skill's `SKILL.md`: `.agents/skills/<name>/SKILL.md`
2. Helper scripts are at `.agents/skills/<name>/scripts/` if present
3. The `tools.md` reference is at `.agents/agent-scripts-resources/tools.md`

## Available skills (53)

| Skill | Description |
|---|---|
| `agent-transcript` | Record and replay agent transcripts |
| `beeper` | Beeper / messaging automation |
| `browser-use` | Direct browser control via CDP |
| `clawsweeper-status` | OpenClaw status checks |
| `clickclack` | Keyboard shortcut / input automation |
| `cloudflare-registrar` | Cloudflare domain & DNS management |
| `codex-debugging` | Codex agent debugging helpers |
| `codex-first` | First-run Codex setup and orientation |
| `codex-huge-context` | Strategies for huge-context Codex sessions |
| `codexbar` | Codexbar menu-bar integration |
| `create-cli` | Scaffold a new CLI project |
| `discord-clawd` | Discord bot / Claude integration |
| `domain-dns-ops` | Domain & DNS operations |
| `fleet-maintenance` | Multi-repo fleet maintenance |
| `frontend-design` | Frontend UI/UX design guidance |
| `github-author-context` | GitHub author and commit context |
| `github-cache-hygiene` | GitHub Actions cache cleanup |
| `github-deep-review` | Deep PR code review |
| `github-project-triage` | GitHub Issues/Projects triage |
| `hopper-debugger` | Hopper disassembler automation |
| `instruments-profiling` | Xcode Instruments profiling |
| `mac-maintenance` | macOS maintenance tasks |
| `maintainer-orchestrator` | Orchestrate multi-repo maintenance |
| `markdown-converter` | Convert documents to Markdown |
| `nano-banana-pro` | Image / diagram generation |
| `native-app-performance` | Native app performance audits |
| `notcrawl` | Notification crawling and parsing |
| `npm` | NPM package management helpers |
| `obsidian` | Obsidian vault automation |
| `openai-image-gen` | OpenAI image generation |
| `openclaw-relay` | OpenClaw relay communication |
| `oracle` | Oracle database helpers |
| `project-structure` | Project scaffolding and structure |
| `release-mac-app` | macOS app release workflow |
| `release-tweets` | Draft and post release tweets |
| `reminders` | Apple Reminders integration |
| `remote-mac` | Remote Mac control and SSH |
| `skill-cleaner` | Audit and clean stale skills |
| `sonos` | Sonos speaker control |
| `speaking` | Text-to-speech / presentation helpers |
| `ssh-doctor` | SSH diagnostics and key management |
| `swift-concurrency-expert` | Swift async/await concurrency guidance |
| `swiftui-liquid-glass` | SwiftUI Liquid Glass effects |
| `swiftui-performance-audit` | SwiftUI performance audit |
| `swiftui-view-refactor` | SwiftUI view refactoring |
| `telecrawl` | Telegram channel crawler |
| `things-todo` | Things 3 task management |
| `twilio-sms` | Twilio SMS integration |
| `video-transcript-downloader` | Download and parse video transcripts |
| `vm-lab` | VM / virtualisation lab setup |
| `whatsapp` | WhatsApp automation |
| `wrangler` | Cloudflare Workers / Wrangler CLI |
| `xcode-sync` | Xcode project sync helpers |
| `xurl` | URL expansion and resolution |

## Updating

```powershell
cd vendor/agent-scripts
git pull --ff-only
```
