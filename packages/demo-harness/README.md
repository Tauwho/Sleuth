# @sleuth/demo-harness

A demo mode for hackathon web apps that you can record the same way every time. Your app runs in the browser against a saved scenario: no network, no keys, no database, and no live API that can fail during a take. It depends only on `zod`, and imports nothing from SLEUTH (a lint rule enforces that), so you can copy the folder into another project.

SLEUTH uses it in `apps/web/lib/demo/` (ADR 0010). That folder is the full worked example.

## What is in it

| Part | What it gives you | File |
|---|---|---|
| Scenario | `ScenarioBaseSchema` (id, disclosure text, job timeline, the scenario's own video, beats). Extend it with your app's recorded answers. | `src/scenario.ts` |
| Timeline | `timelineStage(timeline, elapsedMs)` returns `queued`, `running` or `succeeded`, the same on every run | `src/scenario.ts` |
| In-tab API | `compileRoutes` / `matchRoute` for your endpoint list, `readFetchCall` to turn a `fetch` into method, path and body, and `jsonResponse` | `src/router.ts` |
| State | `createEventLog` (an ordered log of changing calls in sessionStorage, replayed on load), `createSerialQueue` (one call at a time) and `tabStorage` | `src/state.ts` |
| Recording view | `readRecMode` (`?rec=1` / `?rec=0`, kept per tab) and `REC_CSS` (no animation, transition, caret blink or dev overlay) | `src/rec-mode.ts` |
| Pre-flight | `checkVideo`, `serverApiCalls`, `headingFontLoaded`, `checkViewport` | `src/preflight.ts` |
| Rehearsal | `DemoBeatSchema`: open, click, edit and expect steps with narration and a time limit. SLEUTH's runner is `tests/e2e-demo/rehearse.spec.ts`. | `src/scenario.ts` |

## Using it in another app

1. **Describe the scenario.**

   ```ts
   import { z } from "zod";
   import { ScenarioBaseSchema } from "@sleuth/demo-harness";

   export const MyScenario = ScenarioBaseSchema.extend({
     replay: z.object({ answers: z.array(z.string()) }), // what your slow or paid API returned once
   });
   ```

2. **Answer your API in the tab.** Give your API client a `fetch` that never leaves the browser:

   ```ts
   import { compileRoutes, createEventLog, createSerialQueue, jsonResponse, matchRoute,
     readFetchCall, tabStorage } from "@sleuth/demo-harness";

   const routes = compileRoutes([{ id: "list", method: "GET", path: "/items" }, /* ... */]);
   const log = createEventLog(tabStorage(), `my-app-demo:${scenario.id}:v1`);
   // On load: replay log.read() into a fresh in-memory store, with your clock set to each entry's `at`.
   const serial = createSerialQueue(replay());

   export const demoFetch: typeof fetch = async (input, init) => {
     const call = readFetchCall(input, init, "/api");
     if (!call) return jsonResponse(404, { error: "demo answers /api only" });
     return serial(async () => {
       const hit = matchRoute(routes, call.method, call.path);
       // run your handler on the in-memory store; for a non-GET, push
       // { kind: "call", at: now, method, path, body } and log.save(entries)
       return jsonResponse(200, /* result */ {});
     });
   };
   ```

   For slow jobs, keep `{ jobId, createdAtMs }` and answer the status from
   `timelineStage(scenario.timeline, now - createdAtMs)`. When it reaches `succeeded`, apply your recorded result and log `{ kind: "event", name: "finish", ... }`, so a reload ends in the same state.

3. **Show the disclosure** on every page, with a Reset button that calls `log.clear()` and reloads.

4. **Recording view.** On mount, call `readRecMode(location.search, sessionStorage, "my-app:rec")`. When it is on, set `document.documentElement.dataset.rec = "1"`, render `<style>{REC_CSS}</style>` and hide the Reset button.

5. **Pre-flight page.** Show `checkVideo(video.path, video.durationMs)`, `serverApiCalls("/api/") === 0`, `headingFontLoaded()` and `checkViewport()` as OK or "fix this" rows. Add a "Reset and start recording" button that opens `/?rec=1`.

6. **Rehearse.** Put beats in a JSON file and play them in Playwright, one `test.step` per beat. Fail on a missing control, different text, a slow step, or any request to your server API or another host. Copy `tests/e2e-demo/rehearse.spec.ts` as a start.

## Rules that keep a demo honest

- The disclosure says it is sample data, on every page and in the recording.
- Recorded answers come from one real run, with their provenance noted in the scenario.
- Never present demo output as a live analysis.
