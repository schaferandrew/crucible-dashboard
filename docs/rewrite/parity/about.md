# About page parity (ABOUT-*)

| ID | Status | Note |
|---|---|---|
| ABOUT-01 | done | Static prose in `About.svelte`; disclaimer kept. Breadcrumb is the shared "Crucible › About" instead of "← Crucible results" (a back link to the leaderboard is added at the foot). Section order unchanged. |
| ABOUT-02 | done | Six steps, static (HC-16). |
| ABOUT-03 | done | Section labels, group rows, area label/blurb/examples from the catalog; missing blurb/examples are an em dash. No separate fallback file exists any more (B-11). |
| ABOUT-04 | done | Tier `detail`, else `blurb`. Overall label from the catalog. The Combined paragraph shows only when the suite has two or more sections (otherwise there is no Combined view). |
| ABOUT-05 | done | Rules read from task files at build time (`+page.server.ts`, so only the rules ship, not each task's runs); active tasks with rules only; tooltip = id. |
| ABOUT-06 | done | Crucible version from `meta.json`; suite id and changelog URL from the catalog, default in `config.ts`. |
| ABOUT-07 | done | Install snippet and repo link from `config.ts`; "Share your results" draft box kept. |
| ABOUT-08 | done | Current suite only, no selector; prerendered, so no loading state. |
