# Screenshot status

Screenshots were captured at desktop resolution from the locally running React application. The audit used a local demo account and local demonstration records; no personal email, token, cookie, database URI, or production record appears in the images.

| File | Screen | Data source | Status |
|---|---|---|---|
| `screenshots/01-home.png` | Authenticated landing/search | Real application UI | Captured |
| `screenshots/02-product-search.png` | Product results and comparison | Live marketplace result cached in local MongoDB | Captured |
| `screenshots/03-authenticity-analysis.png` | Score, verdict, sentiment | Clearly labelled local demo analysis | Captured |
| `screenshots/04-analysis-history.png` | Saved analysis history | Local demo record | Captured |
| `screenshots/05-image-verification.png` | Image verification interface | UI only; provider unavailable | Captured |

No browser-extension or logo-model result screenshot is included because those flows were not executed end to end. Image inference output is also absent because no provider credential was configured. Reproduce the available screens by starting all services, registering a demo account, performing a search, and opening/saving an analysis.
