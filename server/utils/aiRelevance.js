/**
 * AI-Powered Product Relevance Filter
 * -----------------------------------
 * Uses an LLM via OpenAI-compatible API to classify whether each product
 * actually matches the user's search query.
 *
 * Works with any OpenAI-compatible provider:
 *   - Groq (free):   LLM_BASE_URL=https://api.groq.com/openai/v1, MODEL=llama-3.1-8b-instant
 *   - Google Gemini: LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
 *   - xAI Grok:      LLM_BASE_URL=https://api.x.ai/v1
 *   - OpenAI:        LLM_BASE_URL=https://api.openai.com/v1
 *
 * Fallback: if no API key set or API fails, skip AI filtering (heuristic still applies).
 *
 * Rate limiting:
 *   - Shared global queue ensures only ONE AI call runs at a time.
 *   - Honors `retry-after` on 429 responses, exponential backoff otherwise.
 *   - Per-batch size kept small to stay under Groq's 6k/30k TPM limits.
 */

const axios = require('axios');

const BATCH_SIZE = 15;            // small batches → fits under Groq TPM limits
const API_TIMEOUT = 30000;
const MAX_RETRIES = 4;
const MIN_GAP_MS = 1500;          // spacing between sequential calls (stays under 30 RPM)

const getApiKey = () => process.env.LLM_API_KEY || process.env.XAI_API_KEY || '';
const getBaseUrl = () => process.env.LLM_BASE_URL || process.env.XAI_BASE_URL || 'https://api.x.ai/v1';
const getModel = () => process.env.LLM_MODEL || process.env.XAI_MODEL || 'llama-3.1-8b-instant';

// ===== Global serial queue for AI calls =====
// All platforms' AI filter calls wait their turn. Prevents parallel
// firehose that trips Groq's TPM limit.
let queueTail = Promise.resolve();
let lastCallAt = 0;

function enqueue(fn) {
  const run = async () => {
    const gap = Date.now() - lastCallAt;
    if (gap < MIN_GAP_MS) await new Promise(r => setTimeout(r, MIN_GAP_MS - gap));
    try {
      return await fn();
    } finally {
      lastCallAt = Date.now();
    }
  };
  const result = queueTail.then(run, run);
  queueTail = result.catch(() => {}); // keep queue alive on errors
  return result;
}

function buildSystemPrompt() {
  return `You are a strict product-relevance classifier for an e-commerce price comparison site.

The user searches for a SPECIFIC product. Decide which listings actually match what they're looking for.

RULES (apply to ANY product category — phones, laptops, shoes, cosmetics, kitchenware, etc.):
1. Exact model/version match. Different generation/model year/edition = irrelevant.
2. Brand must match. Reject knockoffs, "just like X" clones, unbranded equivalents.
3. No accessories unless the user asked for them. Reject cases, covers, protectors, cables, mounts, replacement parts FOR the product.
4. Reject "compatible with X" / "for X" listings (they are accessories, not X).
5. Reject unrelated products that only share a keyword.
6. Keep variants that don't narrow the class: colors, storage sizes, pack quantities — unless the query specified them.
7. Trust intent. Broad query ("gaming mouse") → any gaming mouse is fine. Specific query → only that specific product.

Output exactly this JSON: {"results":[{"i":<index>,"r":<true|false>,"why":"<≤10 words>"}]}

ONE entry per input index. "i" must match the input index.`;
}

function buildUserMessage(query, products) {
  // Short listing — just name, no platform prefix (saves tokens)
  const listing = products.map((p, i) =>
    `${i}: ${p.name.substring(0, 100)}`
  ).join('\n');
  return `Query: "${query}"\n\nProducts (${products.length}):\n${listing}`;
}

async function classifyBatch(query, products, apiKey, baseUrl, model) {
  const body = {
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserMessage(query, products) }
    ],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' }
  };

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const resp = await axios.post(url, body, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: API_TIMEOUT
  });

  const content = resp.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from LLM');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error('LLM returned invalid JSON');
  }

  const array = Array.isArray(parsed) ? parsed
    : Array.isArray(parsed.results) ? parsed.results
    : Array.isArray(parsed.classifications) ? parsed.classifications
    : Array.isArray(parsed.data) ? parsed.data
    : Array.isArray(parsed.items) ? parsed.items
    : Object.values(parsed).find(v => Array.isArray(v));

  if (!Array.isArray(array)) throw new Error('LLM response had no array');

  const result = new Map();
  for (const item of array) {
    const idx = typeof item.i === 'number' ? item.i : (typeof item.index === 'number' ? item.index : null);
    if (idx === null) continue;
    result.set(idx, {
      relevant: item.r === true || item.relevant === true,
      why: item.why || item.reason || ''
    });
  }
  return result;
}

/**
 * Classify one batch with retry/backoff honoring rate-limit headers.
 */
async function classifyWithRetry(query, batch, apiKey, baseUrl, model, batchLabel) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await enqueue(() => classifyBatch(query, batch, apiKey, baseUrl, model));
    } catch (err) {
      const status = err.response?.status;
      const retryAfterHdr = err.response?.headers?.['retry-after'];
      const isRateLimit = status === 429;
      const isServerErr = status >= 500 && status < 600;

      if (attempt === MAX_RETRIES) {
        console.warn(`  ⚠️ [AI] ${batchLabel} gave up after ${MAX_RETRIES} tries: ${err.message}`);
        return null;
      }

      // Compute wait: honor retry-after, else exponential backoff
      let waitMs;
      if (isRateLimit && retryAfterHdr) {
        waitMs = Math.min(60000, Math.ceil(parseFloat(retryAfterHdr) * 1000) + 500);
      } else if (isRateLimit) {
        waitMs = Math.min(30000, 5000 * attempt);   // 5s, 10s, 15s
      } else if (isServerErr) {
        waitMs = 1500 * attempt;                     // 1.5s, 3s, 4.5s
      } else {
        waitMs = 1000 * attempt;                     // 1s, 2s, 3s
      }

      console.warn(`  ⚠️ [AI] ${batchLabel} attempt ${attempt} failed (${status || err.code || 'network'}): waiting ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  return null;
}

/**
 * Main entry: filter a list of products by AI-judged relevance.
 */
async function filterByAIRelevance(products, query) {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();
  const model = getModel();

  if (!apiKey) return { kept: products, rejected: [], used: false, reason: 'no LLM_API_KEY' };
  if (!products || products.length === 0) return { kept: [], rejected: [], used: false, reason: 'empty input' };

  const kept = [];
  const rejected = [];
  let succeeded = false;
  const totalBatches = Math.ceil(products.length / BATCH_SIZE);

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const label = `batch ${batchNum}/${totalBatches}`;

    const verdicts = await classifyWithRetry(query, batch, apiKey, baseUrl, model, label);

    if (verdicts) {
      succeeded = true;
      batch.forEach((product, batchIdx) => {
        const verdict = verdicts.get(batchIdx);
        if (!verdict || verdict.relevant) {
          kept.push(product);
        } else {
          product._rejectReason = verdict.why;
          rejected.push(product);
        }
      });
    } else {
      // Failed batch — keep products (fail open)
      batch.forEach(p => kept.push(p));
    }
  }

  return {
    kept,
    rejected,
    used: succeeded,
    reason: succeeded ? `classified ${products.length} products` : 'all batches failed'
  };
}

module.exports = { filterByAIRelevance };
