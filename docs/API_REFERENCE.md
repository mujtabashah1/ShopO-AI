# API reference

Base URL: `http://localhost:5000`. JSON routes use `Content-Type: application/json`. Protected routes require `Authorization: Bearer <JWT>`.

## Authentication

| Method | Path | Body/query | Success |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` | User data and token |
| POST | `/api/auth/login` | `{ email, password }` | User data and token |
| GET | `/api/auth/me` | — | Current user |

Passwords must meet the validators in `server/routes/auth.js`. Password hashes are excluded from API responses.

## Products

| Method | Path | Input | Notes |
|---|---|---|---|
| GET | `/api/products/search` | `q`, repeated/comma-delimited `platforms` as supported by the controller | Aggregated response; rate limited |
| GET | `/api/products/search/stream` | Same query parameters plus token handling used by the client | SSE platform progress and results |
| POST | `/api/products/identify-image` | Multipart field `image` | Requires OpenRouter configuration |

Supported adapter identifiers are `amazon`, `ebay`, `aliexpress`, and `daraz`.

## Analysis

| Method | Path | Input | Success |
|---|---|---|---|
| POST | `/api/analysis/analyze` | Product name, price, platform, URL, seller/review fields, reviews, and comparison context | Persisted score, factors, sentiment, verdict |
| POST | `/api/analysis/verify-image` | Multipart field `image` plus product context | Provider vision result |
| POST | `/api/analysis/verify-url` | Image URL plus product context | Provider vision result |
| GET | `/api/analysis/history` | — | Current user’s analyses |
| GET | `/api/analysis/:id` | Analysis MongoDB id | One user-owned analysis |

## Extension

`GET /api/extension/status`, `POST /register`, `POST /heartbeat`, `GET /tasks`, `POST /results`, and `POST /review-results` coordinate the optional extension. All are protected.

## Python service

Base URL: `http://localhost:8000`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service readiness |
| POST | `/analyze` | Combined enhanced analysis |
| POST | `/sentiment` | VADER/TextBlob ensemble |
| POST | `/fake-detection` | Duplicate and linguistic review signals |

The Pydantic request definitions in `python-ai/main.py` are the canonical field contracts.

## Errors

The API uses standard 4xx errors for validation, authentication, authorization, rate limits, and unavailable optional providers, and 5xx errors for unexpected failures. Marketplace streaming failures are emitted per platform so partial results remain usable.
