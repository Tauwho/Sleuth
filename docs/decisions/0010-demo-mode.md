# 0010 Demo mode: the browser plays a scenario with no network

## Context
Demo videos were recorded on production with a guest copy of the public demo (D-22). A paused Supabase project, a full connection pooler, a slow cold start or a late worker could spoil a take. The plan for a public demo site also needs every visitor to have their own state, and the in-memory fixture store does not give that on Vercel: each serverless instance has its own memory.

## Decision
- A third data mode, `SLEUTH_DATA_MODE=demo`. The server sends the browser only a scenario id (`SLEUTH_DEMO_SCENARIO`, default `proofpay-v1`). It reads no keys and builds no Supabase client.
- The browser answers every `/api/v1` call itself (`apps/web/lib/demo/demo-api.ts`): the same fixture store and domain rules as fixture mode, and the same contract schemas on every request and response. The API client gets it as its `fetch`, so no screen changes.
- State is an ordered log of the calls that changed something, kept in sessionStorage per tab and replayed on load with the recorded clock values. A reload shows the same state, a new tab starts fresh, and nothing is shared between visitors.
- A scenario (`apps/web/lib/demo/scenario.ts`, Zod-checked) holds a fixed job timeline and the recorded transcript and frames. "Run analysis" goes queued, then running, then succeeded at the scenario's times, and the real evidence engine runs on the recorded answers. The same steps give the same evidence and findings every time.
- Every page shows the scenario's disclosure (sample data, nothing leaves the browser).
- To run the engine in the browser, `@sleuth/media/core` exports the provider ports, mocks and validation without FFmpeg.

## Limits
- Demo mode shows recorded results only. It proves nothing about a new video.
- Uploading in demo mode keeps only the file's name and length, as fixture mode does.
- A saved log from an older build stops replaying at the first call that no longer applies.

## Rejected
- Server-side demo state: lost across serverless instances.
- Sending the state with every request: too large for headers, and more to trust on the server.
