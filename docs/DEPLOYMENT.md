# Deployment
- **Render static site:** build command `npm run build`, publish directory `dist`, auto-deploy on push to `main`. $0.
- **No environment variables or secrets:** the app has no backend.
- **CI** (`.github/workflows/ci.yml`): tests, build, and a reduced validation run that must keep V1–V3 met.
