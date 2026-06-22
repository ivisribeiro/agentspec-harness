# packs/ — optional specialist bundle (not shipped in core)

Spindle's **core** is a lean SDD harness: the `spin` engine, the typed gates, the
harness workers that drive the SDD / review / migrate / KB / fact-check flows, and a
small set of design/dev support agents. That is what ships in `plugin/`.

Everything here is **optional, reversible, and out of the core install**. These are the
free-floating domain specialists and thin delegator commands that came from the original
catalog — useful for ad-hoc domain work, but not part of the SDD harness itself and not
dispatched by any harness workflow. They were moved here (not deleted) so the core reads
as one coherent product while the breadth stays one `git mv` away.

```
packs/
  specialists/          48 domain agents (cloud, platform, data-engineering, niche
                        architect/python/dev/test) — pure domain expertise, no SDD role
  commands/             thin delegator commands (the 7 generic data-engineering ones)
  skills/               data-engineering-guide (the catalog routing guide)
```

Not listed in `package.json` `files`, so they are not published to npm and not loaded by
the plugin. To bring one back into the core, `git mv` it under `plugin/` and regenerate
`plugin/skills/agent-router/routing.json` (then `spin gate G_ROUTER_COVERAGE` must stay
green). A future `spin pack add` could automate this.
