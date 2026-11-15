# 0011 Local OCR for visitors' videos

## Context
Decision D-4 keeps visitors' frames away from third parties, so a visitor's job was speech only. Speech alone gives a screen claim no candidate, so a visitor's report was mostly Ghost and "needs outside proof", which looks broken. Đăng approved on-screen text reading in place of Gemini for visitors (15 Nov 2026).

## Decision
- `LOCAL_OCR=tesseract` (worker): when a job may not send frames to `VIDEO_ANALYSIS_PROVIDER`, the worker cuts the frames anyway and reads their on-screen text with Tesseract on the runner (`packages/media/src/providers/video-analysis-tesseract.ts`). Nothing leaves the machine, so D-4 still holds.
- Team accounts on `VIDEO_ANALYSIS_OWNER_IDS` still use Gemini, which also sees what is not text.
- The worker log says which source ran: `screenSource` is `remote`, `local_ocr` or `none`.
- Tesseract is installed with apt on the GitHub runner. It is open source and free; the only cost is runner time.

## Limits
- Text only. A claim like "the chart turns green" gets no candidate from OCR and stays "needs outside proof".
- OCR misreads small or stylised text. Every match is still a candidate that a person confirms.
- Not measured (D-21 still applies).
