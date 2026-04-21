/**
 * Vision API wrapper — uses OpenRouter as the gateway to Gemini (or any vision model)
 * ----------------------------------------------------------------------------------
 *
 * OpenRouter is OpenAI-compatible, so we use the standard chat-completions API
 * with image_url content. Default model is the FREE Gemini 2.0 Flash.
 *
 * Get a free key at https://openrouter.ai/keys
 *
 * Env vars:
 *   OPENROUTER_API_KEY=sk-or-v1-...
 *   OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free  (default — FREE)
 *
 * Other free vision models on OpenRouter (any one works):
 *   - google/gemini-2.0-flash-exp:free
 *   - google/gemini-2.0-flash-thinking-exp:free
 *   - meta-llama/llama-3.2-11b-vision-instruct:free
 *   - meta-llama/llama-3.2-90b-vision-instruct:free
 *   - qwen/qwen2-vl-7b-instruct:free
 *
 * Same exported functions as before (identifyProduct, verifyAuthenticity, isAvailable)
 * so callers don't need to change.
 */

const axios = require('axios');
const crypto = require('crypto');

const DEFAULT_MODEL = 'openai/gpt-4.1';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 30000;
const FALLBACK_MODELS = [];  // no fallback — use only the configured model

// Backward-compat: support both OPENROUTER_* and legacy GEMINI_* env vars
const getKey = () =>
  process.env.OPENROUTER_API_KEY ||
  process.env.GEMINI_API_KEY ||
  '';

const getModel = () =>
  process.env.OPENROUTER_MODEL ||
  process.env.GEMINI_MODEL ||
  DEFAULT_MODEL;

// In-memory cache: same image + same prompt → no extra API call
const responseCache = new Map();
const CACHE_MAX_SIZE = 500;

function cacheKey(imageBuffer, prompt) {
  const imgHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
  const promptHash = crypto.createHash('md5').update(prompt).digest('hex');
  return `${imgHash}:${promptHash}`;
}

/**
 * Try to call OpenRouter with one specific model. Returns the text response,
 * or throws an error (caller decides whether to fall back to another model).
 */
async function tryOneModel(model, body, headers) {
  const MAX_RETRIES = 3;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await axios.post(API_URL, { ...body, model }, { headers, timeout: TIMEOUT_MS });
      const text = resp.data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('OpenRouter returned empty response');
      return text.trim();
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const errBody = err.response?.data?.error;

      // Log the actual OpenRouter error for transparency
      if (errBody) {
        console.warn(`  ⚠️ [${model}] ${status}: ${errBody.message || JSON.stringify(errBody).substring(0, 200)}`);
      } else {
        console.warn(`  ⚠️ [${model}] ${status || err.code}: ${err.message}`);
      }

      const isRetriable = status === 429 || (status >= 500 && status < 600);
      // Don't retry 404 / 401 / 400 — those are config issues, not transient
      if (!isRetriable) throw err;
      if (attempt === MAX_RETRIES) break;

      const retryAfter = err.response?.headers?.['retry-after'];
      const waitMs = retryAfter
        ? Math.min(60000, parseFloat(retryAfter) * 1000 + 500)
        : Math.min(30000, 4000 * attempt);
      console.warn(`     retry ${attempt}/${MAX_RETRIES} after ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

/**
 * Call the vision model via OpenRouter with an image + prompt.
 * If the configured model 404s, tries fallback models automatically.
 */
async function callVisionWithImage(imageBuffer, mimeType, prompt, options = {}) {
  const apiKey = getKey();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  // Cache check — same image + same prompt = no API call
  const key = cacheKey(imageBuffer, prompt);
  if (responseCache.has(key)) {
    console.log('  📦 [Vision] Cache hit (skipping API call)');
    return responseCache.get(key);
  }

  const base64Image = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const body = {
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    }],
    temperature: 0.2,
    max_tokens: 1024,
    ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {})
  };

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'SmartShop AI',
  };

  // Build model list: configured model first, then fallbacks (deduped)
  const configured = getModel();
  const modelChain = [configured, ...FALLBACK_MODELS.filter(m => m !== configured)];

  let lastErr;
  for (const model of modelChain) {
    try {
      console.log(`  🤖 [Vision] Trying ${model}...`);
      const result = await tryOneModel(model, body, headers);

      // Cache successful response
      if (responseCache.size >= CACHE_MAX_SIZE) {
        const firstKey = responseCache.keys().next().value;
        responseCache.delete(firstKey);
      }
      responseCache.set(key, result);

      if (model !== configured) {
        console.log(`  ℹ️  [Vision] Used fallback model "${model}" — consider updating OPENROUTER_MODEL in .env`);
      }
      return result;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;

      // 401 = bad API key (no point trying other models)
      if (status === 401) {
        const e = new Error('Invalid OpenRouter API key. Check OPENROUTER_API_KEY in .env.');
        e.status = 401;
        throw e;
      }

      // 404 / 400 / 429 → try next model in chain
      if (status === 404 || status === 400) {
        console.log(`  ↻ [Vision] Model unavailable, trying next...`);
        continue;
      }
      if (status === 429) {
        console.log(`  ↻ [Vision] Rate limited on ${model}, trying next...`);
        continue;
      }

      // Other errors — abort
      throw err;
    }
  }

  const status = lastErr?.response?.status;
  if (status === 429) {
    const e = new Error('All vision models are rate-limited. Try again in 30 seconds.');
    e.status = 429;
    e.rateLimited = true;
    throw e;
  }
  if (status === 404) {
    throw new Error(`Vision models unavailable. The configured model "${configured}" doesn't exist on OpenRouter, and fallbacks also failed. Update OPENROUTER_MODEL in .env to one of: ${FALLBACK_MODELS.join(', ')}`);
  }
  throw lastErr;
}

/**
 * Identify a product from an image — brand, model, category.
 */
async function identifyProduct(imageBuffer, mimeType) {
  const prompt = `You are a product identification expert. Analyze this image and identify the product.

Respond with ONLY a JSON object — no markdown, no code fences, no extra text:
{
  "brand": "brand name or null",
  "model": "specific model/variant or null",
  "productType": "what type of product (e.g., smartphone, headphones, watch)",
  "query": "best search query to find this product on shopping sites — be specific (brand + model)",
  "confidence": "high | medium | low"
}

Examples:
- iPhone 15 Pro Max photo → {"brand":"Apple","model":"iPhone 15 Pro Max","productType":"smartphone","query":"Apple iPhone 15 Pro Max","confidence":"high"}
- Generic running shoe → {"brand":null,"model":null,"productType":"running shoes","query":"running shoes","confidence":"low"}
- Nike Air Max 90 → {"brand":"Nike","model":"Air Max 90","productType":"sneakers","query":"Nike Air Max 90","confidence":"high"}`;

  const text = await callVisionWithImage(imageBuffer, mimeType, prompt, { jsonMode: true });

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error('Vision model returned non-JSON: ' + text.substring(0, 200));
  }

  return {
    brand: parsed.brand || null,
    model: parsed.model || null,
    productType: parsed.productType || null,
    query: parsed.query || parsed.productType || 'unknown product',
    confidence: parsed.confidence || 'low',
  };
}

/**
 * Verify product authenticity from an image.
 */
async function verifyAuthenticity(imageBuffer, mimeType, category = 'unknown') {
  const prompt = `You are a product-authenticity expert. Analyze this image of a ${category} product and determine if it appears genuine or counterfeit.

Look for these signs of counterfeits:
- Misspelled or distorted brand names/logos
- Wrong logo proportions, colors, or fonts
- Cheap-looking build, materials, or finish
- Missing or wrong details (textures, ports, badges)
- Inconsistent colors or alignment
- Obvious manufacturing defects

Respond with ONLY a JSON object — no markdown, no code fences:
{
  "verdict": "Genuine | Counterfeit | Inconclusive",
  "confidence": <integer 0-100>,
  "brand": "detected brand name or null",
  "productType": "what the product appears to be",
  "redFlags": ["list", "of", "specific", "issues", "spotted"],
  "positiveSignals": ["genuine-looking", "details", "spotted"],
  "explanation": "1-2 sentence summary of your assessment"
}

Be honest. If the image quality is too low to judge, return Inconclusive.`;

  const text = await callVisionWithImage(imageBuffer, mimeType, prompt, { jsonMode: true });

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error('Vision model returned non-JSON: ' + text.substring(0, 200));
  }

  return {
    verdict: parsed.verdict || 'Inconclusive',
    confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, parsed.confidence)) : 50,
    brand: parsed.brand || null,
    productType: parsed.productType || null,
    redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
    positiveSignals: Array.isArray(parsed.positiveSignals) ? parsed.positiveSignals : [],
    explanation: parsed.explanation || '',
  };
}

const isAvailable = () => !!getKey();

module.exports = { identifyProduct, verifyAuthenticity, isAvailable };
