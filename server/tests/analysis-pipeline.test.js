const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeReview, analyzeReviews } = require('../ai/sentimentAnalyzer');
const { calculateAuthenticityScore } = require('../ai/authenticityScorer');
const { detectDuplicateReviews } = require('../ai/cosineSimilarity');
const { getVerdict } = require('../ai/verdictEngine');

test('sentiment analyzer separates clear positive and negative text', () => {
  assert.equal(analyzeReview('Excellent quality and I love it').label, 'positive');
  assert.equal(analyzeReview('Terrible product, broken and awful').label, 'negative');
  const aggregate = analyzeReviews(['Excellent quality and I love it', 'Terrible product, broken and awful']);
  assert.equal(aggregate.totalReviews, 2);
  assert.equal(aggregate.positive + aggregate.neutral + aggregate.negative, 100);
});

test('authenticity score is an explainable bounded heuristic', () => {
  const result = calculateAuthenticityScore({
    productPrice: 95,
    averagePrice: 100,
    sellerRating: 4.8,
    reviewCount: 600,
    sentimentData: { positive: 80, neutral: 10, negative: 10 },
  });
  assert.ok(result.totalScore >= 0 && result.totalScore <= 100);
  assert.equal(Object.keys(result.breakdown).length, 4);
});

test('duplicate review detector flags near-identical reviews', () => {
  const result = detectDuplicateReviews([
    'The headphones sound excellent and the battery lasts all day',
    'The headphones sound excellent and the battery lasts all day',
    'Packaging arrived late but the product works',
  ]);
  assert.ok(result.duplicateCount >= 1);
  assert.ok(result.suspiciousPercentage > 0);
});

test('verdict engine returns a stable recommendation contract', () => {
  const result = getVerdict({
    productName: 'Wireless Headphones',
    productPrice: 95,
    averagePrice: 100,
    sellerRating: 4.8,
    reviewCount: 600,
    reviews: ['Excellent headphones with clear sound and strong battery life'],
  });
  assert.equal(result.verdict, 'Buy');
  assert.ok(result.authenticityScore >= 75);
  assert.equal(typeof result.suggestion, 'string');
});
