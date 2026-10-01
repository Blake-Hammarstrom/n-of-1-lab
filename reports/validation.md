# Method validation (synthetic; method verification, not usefulness)

Protocol: docs/VALIDATION_PROTOCOL.md · 4000 simulated experiments per scenario · limit 5.7% · run 2026-10-01T16:06:45.583Z

| Criterion | Result |
|---|---|
| V1_false_positives | met |
| V2_coverage | met |
| V3_planner | met |

| Scenario | Noise | Period | False positive (peeking) | Interval ever missed truth | Power @30 | Naive t, peeking | Before/after |
|---|---|---|---|---|---|---|---|
| S1 | iid | 1d | 1.3% | 1.6% | 39.8% | 26.6% | 5.1% |
| S2 | t3 | 1d | 1.2% | 1.0% | 59.7% | 22.8% | 4.4% |
| S3 | ar | 1d | 1.5% | 1.4% | 95.2% | 27.6% | 40.6% |
| S4 | trend | 1d | 1.3% | 1.4% | 41.3% | 27.7% | 100.0% |
| S5 | skew | 1d | 1.4% | 1.1% | 41.3% | 21.6% | 4.5% |
| S6 | coarse | 1d | 1.3% | 1.4% | 57.0% | 25.7% | 5.2% |
| S7 | iid | 3d | 1.1% | 1.1% | 93.3% | 26.8% | 5.1% |
| S8 | ar | 3d | 1.3% | 1.2% | 89.0% | 27.8% | 41.8% |

| Planner check | Recommended blocks | Planner power | Simulated power | Gap |
|---|---|---|---|---|
| S7 | 26 | 82.0% | 87.8% | 5.8% |
| S2-3day | 26 | 82.0% | 91.6% | 9.6% |
