# Development guide

## Service setup

Copy `.env.example` to `.env`, replace `JWT_SECRET`, and start MongoDB. Install JavaScript dependencies with `npm run install-all` and Python dependencies inside a virtual environment with `pip install -r python-ai/requirements.txt`.

Run services separately while debugging:

```powershell
npm run server
npm run client
npm run python-ai
```

Or run `npm run dev-all`. The Windows helper `start-local.ps1` checks the expected local components and writes service logs under the ignored `.local/` directory.

## Database access

The default development database is `smartshop` at `mongodb://localhost:27017/smartshop`. Use MongoDB Compass with that URI, or `mongosh`:

```javascript
mongosh "mongodb://localhost:27017/smartshop"
show collections
db.users.find({}, { password: 0 })
db.searches.find().limit(5)
db.analyses.find().sort({ createdAt: -1 }).limit(5)
```

Never display or export password hashes, JWTs, production connection strings, or personal records. The application creates users through `POST /api/auth/register`; avoid inserting plaintext passwords directly into MongoDB because authentication expects bcrypt hashes.

## Code map

- `client/src/pages`: page-level routes for home, results, detail, history, auth, and image verification.
- `client/src/components`: navigation, product cards, charts, loading, and enhanced analysis.
- `server/routes` and `server/controllers`: HTTP boundary and orchestration.
- `server/scrapers`: marketplace-specific acquisition.
- `server/ai`: deterministic scoring, sentiment, TF-IDF signals, and the inactive logo prototype.
- `server/models`: Mongoose schemas.
- `python-ai/services`: optional enhanced text services.

## Validation workflow

```powershell
npm test
Set-Location client; npm test -- --watchAll=false --runInBand
npm run build
git diff --check
```

Live scraper checks should use a low-volume, ordinary product query and record the date, platform, result count, duration, and error without treating the outcome as a permanent guarantee.

## Security and privacy

- Keep `.env`, local databases, logs, browser profiles, and exports untracked.
- Rotate a secret immediately if it reaches Git history; deleting only the current file is insufficient.
- Use a long random JWT secret and HTTPS in deployed environments.
- Restrict `CLIENT_URL` to trusted frontends and configure production rate limits.
- Uploaded images sent to the vision route leave the application boundary and reach the configured provider; obtain user consent and avoid sensitive images.
- Scrapers should respect site terms, robots/access controls, rate limits, and applicable law. CAPTCHA challenges require manual resolution; do not automate their circumvention.
- Treat all marketplace text and URLs as untrusted input. Keep dependencies patched and run audits in each package.

## Contribution scope

Keep scoring claims tied to measurable evidence. A change that alters thresholds should update unit tests and `AI_METHODOLOGY.md`. A scraper change should include a sanitized fixture or selector test where feasible. Do not commit captured marketplace HTML containing identifiers or session data.
