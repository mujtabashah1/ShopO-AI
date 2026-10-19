# Deployment and release checks

This repository is a hardened prototype. Complete the gates in [MARKET_READINESS.md](MARKET_READINESS.md) before offering it as a commercial service.

## Configuration

- Install from lockfiles with `npm ci`, `npm ci --prefix server`, and `npm ci --prefix client`.
- Set a real `MONGO_URI` and a unique random `JWT_SECRET` of at least 32 characters. Placeholder values fail startup.
- Set `CLIENT_URL` to exact frontend origins, separated by commas. No wildcard Vercel or substring matching is allowed.
- Set `REACT_APP_API_URL=https://your-api.example/api` in the frontend build environment. Both JSON and streaming search use it. Rebuild when it changes.
- Enable Python with `PYTHON_AI_ENABLED=true`, configure `PYTHON_AI_URL`, and set the same random `PYTHON_AI_KEY` (at least 32 characters) in both services. Disable it explicitly if unavailable.
- Keep Python on a private network. The Render blueprint uses a private service with a generated shared key and a service reference for its internal host/port, following the [Render blueprint specification](https://render.com/docs/blueprint-spec). Migrating an existing public Python service may require creating a new private service and updating references; the blueprint was not deployed during this audit.
- Configure `OPENROUTER_API_KEY` only when offering image features. Verify the configured model works with your account before launch.
- Configure `TRUST_PROXY` only with the actual trusted proxy IPs/subnets for your hosting topology. Test client-IP detection and rate limits behind your proxy. Do not blindly trust forwarded headers.

Python loads the root `.env` for local development without overriding environment variables. Never expose keys in the frontend bundle.

## Operational behavior

`GET /api/ready` returns 200 only while MongoDB is connected; otherwise it returns 503. `GET /api/health` is a basic liveness response. SIGTERM/SIGINT drain HTTP requests, close Chromium and disconnect MongoDB, with a 15-second shutdown deadline.

API bodies are limited to 1 MB, extension JSON to 5 MB, and image uploads/downloads to 10 MB. Analysis accepts up to 100 reviews of 5,000 characters each. Remote image downloads accept only HTTPS from the explicit marketplace CDN list in `server/middleware/validateRequest.js`, reject redirects, and enforce a response-size limit. Unsupported CDN images can be uploaded directly. Put network-level egress restrictions around scraping workers; validating the starting listing URL alone does not restrict browser subrequests or redirects.

Search cache version 2 excludes legacy entries, scopes results to the requesting user, checks the one-hour freshness window explicitly, and retains marketplace failure information. Old documents expire through MongoDB's existing TTL index; no destructive migration is required.

## Release verification

1. Run `npm test`, `npm --prefix client test -- --watchAll=false --runInBand`, and `npm run build`.
2. Review `npm audit --prefix server --omit=dev` and `npm audit --prefix client`; resolve or formally assess outstanding advisories. Do not use forced dependency upgrades without regression testing.
3. In staging, test registration, login, expired sessions, streaming search, all-platform failure, cache refresh, saved analysis ownership, pagination, image uploads and provider failure.
4. Confirm readiness changes to 503 during a database outage. Test rate limits through the deployed proxy.
5. Verify current marketplace adapters with permission to access the data, and record fixture-based regression coverage and a live availability report.
6. Measure memory, queue wait, concurrency, and latency under representative load. Current rate limits and the four-handler work limit are per-process; multi-instance capacity needs a shared queue.
7. Configure monitoring, backups and restore drills; publish privacy, retention, support, and account-recovery flows before a paid launch.

Pushing source is not proof of deployment. No production credentials, database, paid image requests, or hosting deployment were exercised in this audit.
