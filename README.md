# claude_mods

Plugins that change Claude Code's own interface. This repository is a
Claude Code plugin marketplace: each plugin lives in its own folder under
`plugins/` and is listed in `.claude-plugin/marketplace.json`.

Requires Claude Code 2.1.295 or newer (`claude --version`; update with
`claude update`).

## Plugins

### usage-band

Shows your plan's usage limits in a band above the prompt:

```
5h   ░░░░░░░░░░░░ 3%  · resets in 4h35m      week ███████████░ 94%  · resets in 12h15m
```

- The 5-hour and weekly windows, as reported with each reply.
- Green below 50%, yellow from 50%, red from 80%.
- The reset countdown updates every minute.
- Stacks onto two lines in a narrow window; `[-]` at the end of the band
  collapses it.

The figures come from a Claude subscription. With an API key there are no
limits to show, and the band stays empty. In a new session it fills in after
the first reply.

## Install

In a terminal session of Claude Code (the install command is not available
in the desktop app's Code tab):

```
/plugin install usage-band --marketplace rajmand/claude_mods
```

Answer `y` to add the marketplace, then press Enter to install at the user
scope. The plugin is active right away. Installed at the user scope, it also
shows in the desktop app's Code tab.

## Developing

Run a plugin from this checkout for one session:

```bash
claude --plugin-dir plugins/usage-band
```

Check and test it:

```bash
claude plugin validate plugins/usage-band
claude plugin test plugins/usage-band
```

To add a plugin, put it in `plugins/<name>/` and add an entry to
`.claude-plugin/marketplace.json`.
