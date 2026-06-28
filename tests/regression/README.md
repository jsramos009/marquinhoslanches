# Regression tests

Browser-driven regression checks executed in CI on every pull request.

## modal_centered.py

Asserts the order modal:

- Opens fully centered on the viewport on fresh load, after scrolling, and
  after a route transition (`/` → `/auth` → `/`).
- Traps focus inside the dialog while Tab / Shift+Tab cycles.
- Returns focus to the opener button after Escape closes the modal.

### Run locally

```bash
bun run build
bunx vite preview --port 4173 &
APP_URL=http://localhost:4173 python tests/regression/modal_centered.py
```

### CI

Triggered by `.github/workflows/regression.yml` on every PR and push to
`main`. Screenshots are uploaded as a `regression-screenshots` artifact when
the job runs (useful for diagnosing failures).