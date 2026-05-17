# JobCopilot Frontend

Next.js app for the JobCopilot FastAPI backend. It supports resume file upload, job description input, company search toggling, live step polling through `/api/jobs`, and a follow-up chat workspace at `/chat?jobId=...`.

## Development

```bash
npm run dev
```

The dev app calls `http://127.0.0.1:8000` when it runs on port `3000`.

## Production Build

```bash
npm run build
```

The static export is written to `out/` and served by the backend FastAPI app.
