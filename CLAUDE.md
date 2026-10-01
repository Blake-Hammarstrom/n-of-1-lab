# n-of-1-lab (Second Brain project 02)
- **Zero dependencies and no network.** Keep the CSP at `connect-src 'none'`, and never add `fetch`, analytics or third-party assets. `test/app.test.mjs` enforces this.
- **The engine's statistical settings and `docs/VALIDATION_PROTOCOL.md` are fixed.** Any change needs a new dated protocol version and a full `npm run validate`.
- **Simulated data must always be labelled as such** (the sample banner, validation reports). Never present it as real use.
- **Evidence tiers:** simulation = method verification; Blake's real experiments = applied. No other claims.
