# Market-readiness audit

Audit date: 20 October 2026. Scope: local repository review, deterministic regressions, dependency audit, and incremental GitHub checkpoints.

**Assessment: substantially hardened prototype, not yet ready for an unrestricted commercial launch.** The product's strongest proposition is explainable marketplace comparison. Authenticity certification is not supported by the evidence or models in this repository.

## Core product

Users register and sign in, search marketplace adapters, receive progressive SSE results, compare normalized prices and seller/review signals, run an explainable rule-based analysis, and revisit their own history. Optional Python services add sentiment, duplicate-review signals, and summaries. Optional external vision analysis inspects uploaded or supported remote images. A browser extension supplements data collection.

## Completed improvements

- Removed a fallback that relabeled other marketplaces' listings as AliExpress and assigned random lower prices when AliExpress failed. Failures now stay visible.
- Replaced localhost-only EventSource requests with authenticated fetch streaming using the configured API URL. JWTs no longer travel in query strings. Network errors and timeouts produce useful messages.
- Versioned and isolated search caches by user, explicitly checked freshness, and retained platform failures. Legacy potentially fabricated results are excluded.
- Replaced substring-based CORS permissions with exact origins and validated startup secrets.
- Added login and expensive-analysis rate limits, bounded queries/reviews/pagination, checked listing hosts, constrained image downloads, and returned appropriate client errors for malformed/oversized requests.
- Bounded expensive search/analysis work to four concurrent handlers per process and shared concurrent browser launches. Added HTTP boundary and capacity regressions.
- Added Python service authentication and request budgets, private-service deployment configuration, database readiness, and graceful shutdown.
- Clarified that favorable scores and image observations do not establish authenticity, and enabled keyboard access to the image upload control.
- Expanded regression coverage and made Python test execution portable without silently retrying a failed test run under a different interpreter.
- Applied compatible server dependency security updates. The initial production audit reported 28 advisories, including one critical. The compatible update reported 15 total advisories including development dependencies (14 high, one moderate), with no critical advisories; these scopes differ and should not be treated as a direct before/after count. The frontend audit initially reported 101 advisories including three critical; compatible updates reported 102 (63 high, 36 moderate, three low), with no critical advisories. A larger count can reflect changed dependency/advisory resolution, so severity and affected paths matter more than a simple total. Legacy React Scripts tooling remains a release blocker; forced audit fixes proposed unusable or breaking replacements and were not applied.

## Remaining bottlenecks and launch gates

| Priority | Bottleneck | Impact | Required evidence before launch |
|---|---|---|---|
| P0 | Remaining dependency advisories | Known exposure remains in browser tooling and image-processing dependencies; some fixes require major changes | Upgrade/remove affected packages with browser and image regression checks; repeat audits |
| P0 | Scraper reliability and data access | HTML changes, CAPTCHA, region and login differences can remove results; earlier audit reported eBay failures | Permission-backed data sources, sanitized fixtures per adapter, fresh live availability checks |
| P1 | Scraping capacity and isolation | Four expensive handlers per process and a shared browser launch reduce overload, but tasks can outlive disconnected clients and page activity is not globally queued | Bounded distributed worker queue, cancellation, egress controls and load measurements |
| P0 | Unvalidated shopping scores | Rule weights and sentiment do not identify counterfeit products; missing reviews reduce evidence | Evaluation dataset, calibrated limitations, evidence completeness and false-positive measurements |
| P1 | Price comparability | Variant/accessory matching, shipping, tax, stale FX fallback and regional offers distort value comparisons | Variant-aware matching, landed-cost disclosure, FX source/age and retrieval timestamps |
| P1 | Account lifecycle and privacy | No password recovery, email verification, session revocation or account deletion flow | Implement and test recovery, verification, deletion/retention, provider disclosure and support flows |
| P1 | Multi-instance operation | Rate limits, browser state and extension task coordination are process-local | Shared state/queue, distributed rate limiting and multi-instance tests |
| P1 | Production verification | Unit tests cannot establish deployed behavior or third-party availability | Staging E2E tests, monitoring, backup restore drill, failure simulation and load testing |
| P2 | Legacy research artifacts | Disconnected models and unclear dataset provenance complicate maintenance and distribution | Separate research assets; document provenance and choose licensing with the owners |

## Verification boundaries

The deterministic suite includes 16 Node tests, six Python tests and five frontend tests. It covers the fabricated-results regression, cache isolation/freshness, bounded requests, origin checks, parser errors, SSE chunk handling and header-based authentication, HTTP boundaries, work limits and shared browser launch alongside the existing scoring tests. Search adapters are mocked in the new regression tests.

No fresh live scrape, production deployment, external vision purchase, production database test, load benchmark, or dataset accuracy evaluation was performed. Previous screenshots and marketplace result counts are historical examples. See [DEPLOYMENT.md](DEPLOYMENT.md) for configuration changes and release checks.

Final post-refresh validation passed: 16 Node tests, six Python tests, five frontend tests, and the optimized production frontend build. This verifies the local release checks, not a live deployment.
