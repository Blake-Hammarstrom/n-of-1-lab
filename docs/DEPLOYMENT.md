# Deployment
- **Render static site:** build command `npm run build`, publish directory `dist`, auto-deploy on push to `main`. $0.
- **No environment variables or secrets:** the app has no backend.
- **CI** (`.github/workflows/ci.yml`): tests, build, and a reduced validation run (SIMS=400) that must keep V1–V2 met (V3 is checked only in the full protocol run).
- **Gates:** All PRs require a static gate (`sb-gate`, from base branch) that validates the task class and branch rules. "Fix" PRs also require a regression gate (`sb-regression`) that ensures new tests fail on base and pass on head.
- **Branch protection:** The `main` branch requires all status checks to pass before merge.
