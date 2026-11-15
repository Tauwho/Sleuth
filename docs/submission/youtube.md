# YouTube upload: title, description, chapters, captions

For the demo video `Sleuth Demo.mp4` (Đạt, 15 November 2026): 2:50, 1920x1080, AI narration (Kokoro, voice "Michael"), subtitles burned in. Chapter times come from the caption file, `docs/submission/captions/sleuth-demo.en.srt`. If the cut changes, re-check every time below against the new caption file before publishing.

Devpost rules for the video: YouTube only; only the first 3 minutes are reviewed; public or unlisted, no password.

## Settings

- Visibility: **Public** on submission day (unlisted until then is fine).
- Audience: not made for kids.
- Category: Science & Technology.
- Language: English. Caption language: English.
- Altered or synthetic content: **Yes** (the narration is an AI voice). YouTube asks this on upload.
- Captions: upload `docs/submission/captions/sleuth-demo.en.srt` as English subtitles, so viewers can turn the burned-in text into proper closed captions and search can read it.
- Thumbnail: `docs/submission/media/00-thumbnail.jpg` works, but YouTube wants 16:9; use a frame from 0:01 (the dashboard hero) if you do not want a crop.

## Title (100 characters max)

```
SLEUTH: The Haunted Cut. Check a demo video against its script and checklist (Kiroween 2026)
```

## Description

```
SLEUTH checks a software demo video against its script and checklist. Every match it finds is a candidate. Only a person can confirm it and apply the Final Seal.

Built for Kiroween 2026 (Costume Contest).

Please note:
- This walkthrough uses the public ProofPay demo and a guest copy of it. The results are sample data prepared ahead of time; no analysis runs in this video. The review actions are shown on sample data.
- The narration is an AI text-to-speech voice (Kokoro, "Michael"). It is not a real person's voice.
- Accuracy is not measured. We publish no accuracy number.

Try it (no account needed): https://sleuth-eight.vercel.app
Code (MIT): https://github.com/dngvmnh/sleuth
Devpost: [Devpost project link]

Chapters
0:00 Demo videos drift from what they promise
0:18 The public demo (sample results)
0:47 The Evidence Lantern: found, not found, limits
1:07 Reviewing a guest copy
1:30 The Final Seal report
1:52 What signing off means
2:12 A script change breaks the seal (Poltergeist)
2:32 Built with Kiro, and the limits

Findings, with their plain names:
Ghost: no visual evidence. Phantom Dialogue: script line not spoken. Cursed Frame: needs a human check. Poltergeist: evidence out of date. Needs Outside Proof: footage cannot prove this.

How it was built: specs, steering, hooks and custom agents in Kiro (all in the repository's .kiro folder). TypeScript, Next.js, Supabase, FFmpeg, Deepgram, Gemini, GitHub Actions, Vercel. Our own screen recordings only; no third-party footage or music.

Team: Đạt (frontend, video), Đăng (backend), Phạm Quốc Bảo (media and evidence engine).

#KiroweenHackathon26 #Kiro
```

## Tags

```
SLEUTH, Kiroween, Kiroween 2026, Kiro, hackathon, demo video, QA, video review, Next.js, Supabase, TypeScript, Devpost
```

## Checked on 15 November 2026

- Length 2:50 (170 s), under the 3-minute review window.
- Audio: mono AAC, -17.0 LUFS integrated, true peak -1.3 dBTP; no clipping. Two pauses of about 2.6 s (1:05 and 1:28), both on screen changes.
- On-screen labels: SLEUTH, prepared sample results, no live analysis in this walkthrough (scenes 1 to 2), "Sample data: a copy of the public demo. Review actions shown on sample data." (scenes 3 to 7), "AI narration: Kokoro / Michael", "Built with Kiro | Repository footage".
- The seal note "Walkthrough on sample data" is on screen and in the narration (1:47).
- No credentials, e-mail addresses or tokens on screen. Signed in as a guest throughout.
- The repository shot (2:32) shows `.kiro/agents/frontend-builder.md`; no failing check is visible.
- No accuracy figure is shown or spoken. The narration says the seal "isn't an accuracy score".
