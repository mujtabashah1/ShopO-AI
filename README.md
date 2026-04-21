# 🛒 Smart Shopping AI

> MERN Stack Final Year Project — Fake product detection, sentiment analysis & multi-platform price comparison.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248?logo=mongodb)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express)

---

## Features

- **Multi-Platform Scraping** — Amazon, eBay, AliExpress, Daraz
- **Authenticity Score (0-100)** — Rule-based AI evaluating price, seller, reviews & sentiment
- **Sentiment Analysis** — AFINN-165 lexicon on individual reviews
- **Verdict System** — Buy ✅ / Risky ⚠️ / Avoid 🚫 with actionable suggestions
- **Interactive Charts** — Gauge, pie chart, score breakdown bars (Recharts)
- **JWT Authentication** — Secure login with search & analysis history
- **Search Caching** — 1-hour TTL cache to avoid redundant scraping

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)

### 2. Environment Setup

Edit `.env` in the project root:

```env
MONGO_URI=mongodb://localhost:27017/smart-shopping-ai
JWT_SECRET=your_secret_key
PORT=5000
```

### 3. Install Dependencies

```bash
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

### 4. Run Development

```bash
npm run dev
```

Opens **server** on port 5000 and **client** on port 3000.

### 5. Use the App

1. Register an account at `http://localhost:3000`
2. Search for any product (e.g., "wireless headphones")
3. Browse results from multiple platforms
4. Click **AI Analysis** on any product
5. View authenticity score, verdict, sentiment chart & review analysis
6. Check your analysis history in the History page

---

## Project Structure

```
smart-shopping-ai/
├── server/          # Express.js backend (API, scrapers, AI engine)
├── client/          # React frontend (SPA)
├── .env             # Environment variables
└── package.json     # Root scripts (concurrently)
```

---

## Documentation

For complete technical documentation covering architecture, database design, AI algorithms, API reference, and more:

👉 **[PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md)**

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, React Router 6, Recharts, Axios, React Toastify |
| Backend | Node.js, Express 4, Mongoose 8, JWT, bcryptjs |
| Scraping | Cheerio (fast) → Puppeteer + Stealth (fallback) |
| AI | AFINN-165 sentiment analysis, rule-based authenticity scoring |
| Database | MongoDB with TTL indexes for caching |

---

## License

This project is created as a Final Year Project for academic purposes.
