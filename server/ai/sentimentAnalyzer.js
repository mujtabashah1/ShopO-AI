/**
 * Sentiment Analyzer
 * ------------------
 * Analyzes the sentiment of product reviews using the `sentiment` npm package.
 * Uses the AFINN-165 word list — a pre-built English sentiment lexicon that
 * assigns scores to ~3,300 words (e.g., "good" = +3, "terrible" = -5).
 * 
 * How it works:
 *   1. Each review text is tokenized into words
 *   2. Each word is looked up in the AFINN dictionary
 *   3. Scores are summed to get a total sentiment score per review
 *   4. Reviews are classified: positive (>1), neutral (-1 to 1), negative (<-1)
 *   5. Percentages are calculated for each category
 * 
 * No API key needed — runs entirely locally.
 */

const Sentiment = require('sentiment');
const sentiment = new Sentiment();

/**
 * Analyze a single review text and return its sentiment.
 * @param {string} text - Review text to analyze
 * @returns {Object} { text, score, comparative, label }
 */
const analyzeReview = (text) => {
  if (!text || typeof text !== 'string') {
    return { text: '', score: 0, comparative: 0, label: 'neutral' };
  }

  const result = sentiment.analyze(text);
  
  // Classify based on the raw score
  // score > 1  → positive (clearly positive words outweigh negative)
  // score < -1 → negative (clearly negative words outweigh positive)
  // -1 to 1    → neutral (balanced or no strong sentiment)
  let label;
  if (result.score > 1) {
    label = 'positive';
  } else if (result.score < -1) {
    label = 'negative';
  } else {
    label = 'neutral';
  }

  return {
    text: text.substring(0, 200), // Truncate long reviews for storage
    score: result.score,
    comparative: result.comparative, // Score per word (normalized)
    label
  };
};

/**
 * Analyze an array of review texts and return aggregated results.
 * 
 * @param {string[]} reviews - Array of review text strings
 * @returns {Object} {
 *   positive: number (percentage),
 *   neutral: number (percentage),
 *   negative: number (percentage),
 *   averageScore: number,
 *   totalReviews: number,
 *   analyzedReviews: Array of { text, score, label }
 * }
 */
const analyzeReviews = (reviews) => {
  // Handle case where no reviews are available
  if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
    return {
      positive: 33,  // Default neutral distribution
      neutral: 34,
      negative: 33,
      averageScore: 0,
      totalReviews: 0,
      analyzedReviews: [],
      note: 'No reviews available — using neutral default values.'
    };
  }

  // Analyze each review
  const analyzedReviews = reviews
    .filter(r => r && typeof r === 'string' && r.trim().length > 0)
    .map(analyzeReview);

  if (analyzedReviews.length === 0) {
    return {
      positive: 33,
      neutral: 34,
      negative: 33,
      averageScore: 0,
      totalReviews: 0,
      analyzedReviews: [],
      note: 'Reviews were empty or could not be analyzed.'
    };
  }

  // Count sentiments
  const positiveCount = analyzedReviews.filter(r => r.label === 'positive').length;
  const neutralCount = analyzedReviews.filter(r => r.label === 'neutral').length;
  const negativeCount = analyzedReviews.filter(r => r.label === 'negative').length;
  const total = analyzedReviews.length;

  // Calculate percentages (rounded to whole numbers)
  const positive = Math.round((positiveCount / total) * 100);
  const neutral = Math.round((neutralCount / total) * 100);
  const negative = Math.round((negativeCount / total) * 100);

  // Calculate average sentiment score across all reviews
  const totalScore = analyzedReviews.reduce((sum, r) => sum + r.score, 0);
  const averageScore = Math.round((totalScore / total) * 100) / 100;

  return {
    positive,
    neutral,
    negative,
    averageScore,
    totalReviews: total,
    analyzedReviews
  };
};

module.exports = { analyzeReviews, analyzeReview };
