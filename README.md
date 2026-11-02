# herdr-workflow

A [Herdr](https://github.com/herdrdev/herdr-app) side panel that shows how the agent tooling of the repo you are working in is doing, for the focused pane, on this computer or on an ssh machine Herdr is connected to:

- **engram**: health (`engram doctor`), observation, session and prompt counts, and the latest observations of the project, each one opening in full in a dialog (Markdown, selectable, with its session, topic and dates)
- **codegraph**: whether the repo is indexed, how long ago, how many files changed since, and the size of the graph
- **context-mode**: what it kept out of the context window

It reads again every minute, and right away when you focus a pane in another folder or on another machine. It only reads: nothing is written, repaired or deleted, in any of the three tools.

## Requirements

On every machine you want to see (this one and each ssh one): `engram`, `codegraph` and `context-mode`, on the PATH of your login shell. A missing tool shows as an error row in its own section, the rest of the panel keeps working.

The panel does not look for the tools itself, it runs one small script through your login shell (`$SHELL -lic`), the same as a terminal you open, so Homebrew, linuxbrew, mise, fnm and the rest are found where they are on each machine.

## Install

1. Copy `mods/agent-workflow` to `~/.config/herdr-app/mods/agent-workflow`. If a mod called `agent-workflow` is already there, copy it under another name and change the one line in `mods/agent-workflow/mod-name.js` to match.
2. `herdr-app check ~/.config/herdr-app/mods/agent-workflow`
3. Put it in a layout as a block, `{ "type": "block", "content": { "mod": "agent-workflow" } }`, or open it on its own with `herdr-app do mod.open --name agent-workflow`.

`mod.json` uses `"place": "none"`, so Herdr does not dock a copy by itself when it first sees the folder.

### With Kanso

[Kanso](https://github.com/jlopezlira/herdr-kanso) opens its side panels from fixed tabs, and its Specs tab points at `sdd-focused`, a mod that is not public. `kanso/kanso-tabs.patch` points that tab at this panel instead and names it Workflow (two lines, made against Kanso `43d489c`):

```sh
cd ~/.config/herdr-app && git apply /path/to/herdr-workflow/kanso/kanso-tabs.patch
```

Then switch away from Kanso and back (`ctrl-shift-l`), so its tab bar sees the new mod. Reinstalling Kanso undoes the patch, apply it again after.

## What it runs

Everything goes through `exec` in Herdr, on the focused pane's machine (`on` is that machine for an ssh pane, so the commands run over Herdr's ssh connection):

| Command | When |
| --- | --- |
| `git rev-parse --show-toplevel` | every read, to find the repo and its name |
| `engram stats`, `engram context`, `engram doctor --json` (one after another, in parallel they fight over engram's SQLite lock) | every read |
| `context-mode statusline` | every read |
| `codegraph status --json` | every read |
| `engram search "<title>"`, then `engram mcp` with one `mem_get_observation` call | when you open an observation |

No network calls of its own and no files written. The engram project is the repo folder's name.

## Development

```sh
npm test                                   # the parsers, with Node's test runner
npm run smoke -- <repo folder>             # the real scripts against the real tools, here
npm run smoke -- <repo folder> --on <host> # the same over ssh
```

The smoke check is what tells you a machine's PATH finds the tools, which unit tests cannot. It carries its own controls: a folder that does not exist and a title that does not exist must both come back as errors, so a run that passes everything without failing those proves nothing.

## Limits

- `engram context` prints no ids, so the dialog finds an observation by its exact title; two with the same title in one project open the newest.
- codegraph only reports the state of the index, not how often agents query it.
- A refresh takes the time your login shell needs to start, plus the tools (around 2 to 4 seconds here).
