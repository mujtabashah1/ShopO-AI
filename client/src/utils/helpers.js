/**
 * Helper Utilities
 * ----------------
 * Shared utility functions used across React components.
 */

/**
 * Get the color associated with a verdict.
 * @param {string} verdict - "Buy", "Risky", or "Avoid"
 * @returns {string} CSS color value
 */
export const getVerdictColor = (verdict) => {
  switch (verdict) {
    case 'Buy': return '#28a745';    // Green
    case 'Risky': return '#ffc107';  // Yellow/Amber
    case 'Avoid': return '#dc3545';  // Red
    default: return '#6c757d';       // Gray
  }
};

/**
 * Get the color for an authenticity score.
 * @param {number} score - Score from 0-100
 * @returns {string} CSS color value
 */
export const getScoreColor = (score) => {
  if (score >= 75) return '#28a745';  // Green
  if (score >= 45) return '#ffc107';  // Yellow
  return '#dc3545';                    // Red
};

/**
 * Get the background color for a platform badge.
 * @param {string} platform - Platform name
 * @returns {string} CSS color value
 */
export const getPlatformColor = (platform) => {
  switch (platform?.toLowerCase()) {
    case 'ebay': return '#e53238';
    case 'aliexpress': return '#ff4747';
    case 'amazon': return '#ff9900';
    case 'daraz': return '#f57224';
    default: return '#6c757d';
  }
};

/**
 * Format a price for display.
 * All prices in the system are now normalized to USD for cross-platform comparison.
 * Daraz products display in PKR via their `displayPrice` field; this helper
 * is used for average price comparisons which are always in USD.
 * @param {number} price - Numeric price (USD)
 * @param {string} platform - Platform name (kept for API compatibility)
 * @returns {string} Formatted price string
 */
export const formatPrice = (price, platform) => {
  if (!price && price !== 0) return 'N/A';
  // All prices are now in USD (Daraz PKR is converted at scrape time)
  return `$${parseFloat(price).toFixed(2)}`;
};

/**
 * Truncate text to a maximum length.
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum characters
 * @returns {string} Truncated text with ellipsis if needed
 */
export const truncateText = (text, maxLength = 60) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Get a human-readable time ago string.
 * @param {string} dateString - ISO date string
 * @returns {string} e.g., "2 hours ago", "3 days ago"
 */
export const timeAgo = (dateString) => {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return date.toLocaleDateString();
};
