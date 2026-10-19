# Testing and validation

## 20 October 2026 hardening checks

The current deterministic suite passed 16 Node tests, six Python tests, and five frontend tests. The optimized production frontend build also passed after the dependency updates. New coverage includes search integrity, cache isolation/freshness, request validation, HTTP boundaries, work limits, shared browser launch, and authenticated SSE parsing. See [MARKET_READINESS.md](MARKET_READINESS.md) for current dependency findings and release gates.

## Historical audit: 13 October 2026

Audit environment: Windows, 13 October 2026. Local endpoints used MongoDB on port 27017, Express on 5000, FastAPI on 8000, and React on 3000.

| Check | Result | Evidence / scope |
|---|---|---|
| Node analysis unit tests | PASS | Sentiment, bounded score, duplicate signals, verdict contract |
| Python service unit tests | PASS | Sentiment thresholds/ensemble and duplicate-review signal |
| React utility tests | PASS | Price formatting, UI color mapping, truncation |
| React production build | PASS | `react-scripts build` completed |
| API health | PASS | Express health endpoint responded locally |
| Python health and analyze | PASS | `/health` and two-review `/analyze` request completed |
| Auth integration | PASS | Register, login, and `/api/auth/me` against local MongoDB |
| Analysis persistence | PASS | Node → FastAPI → MongoDB saved and retrieved a labelled demo analysis |
| Amazon live search | PASS | 23 results for “wireless headphones” in about 46 seconds |
| Daraz live search | PASS | 115 results in about 56 seconds |
| AliExpress live search | PASS | 104 results in about 112 seconds |
| eBay live search | FAIL | Zero results; product selectors and `#gh-ac` timed out |
| Vision verification | BLOCKED | No `OPENROUTER_API_KEY` configured |
| Extension end-to-end | NOT RUN | Unpacked extension was not installed in the audit browser |
| ONNX inference | NOT RUN | Artifact is not wired to code; input/labels are undocumented |
| Deployment smoke test | NOT RUN | No deployment URL was configured or claimed |

Commands used for the repeatable quality gate:

```powershell
npm test
Set-Location client
npm test
npm run build
git diff --check
```

The live results above are integration observations, not test fixtures. Marketplace sites can return different counts or block automation based on time, geography, and page changes. CI intentionally runs deterministic unit/build checks and does not scrape live stores.
