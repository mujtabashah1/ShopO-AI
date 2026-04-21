/**
 * ProductCard Component
 * ---------------------
 * Displays a single product in the search results grid.
 * Shows product image, name, price, platform badge, trust score,
 * caution flag, discount badge, and "AI Analysis" button.
 * 
 * Props:
 *   product - Product object from scraper (with trustScore, isCaution, discount)
 *   onAnalyze - Function called when "AI Analysis" button is clicked
 */

import React from 'react';
import { FiExternalLink, FiCpu, FiAlertTriangle } from 'react-icons/fi';
import { getPlatformColor, truncateText, getScoreColor } from '../utils/helpers';
import './ProductCard.css';

const PKR_PER_USD = 280;

/**
 * If displayPrice is USD-only (e.g. "$23.21"), append PKR conversion.
 * If it already contains "Rs" or "PKR", leave it alone.
 */
const formatPriceWithPKR = (displayPrice, priceUSD) => {
  if (!displayPrice) return displayPrice;
  const str = String(displayPrice);
  if (/Rs|PKR|₨/i.test(str)) return str;
  if (typeof priceUSD !== 'number' || priceUSD <= 0) return str;
  const pkr = Math.round(priceUSD * PKR_PER_USD).toLocaleString();
  return `${str} (Rs. ${pkr})`;
};

const ProductCard = ({ product, onAnalyze }) => {
  const {
    name,
    price,
    displayPrice,
    originalPrice,
    discount,
    image,
    link,
    platform,
    rating,
    reviewCount,
    isBestDeal,
    trustScore,
    isCaution,
    cautionReason
  } = product;

  return (
    <div className={`product-card ${isBestDeal ? 'best-deal' : ''} ${isCaution ? 'caution-card' : ''}`}>
      {/* Best Deal ribbon */}
      {isBestDeal && (
        <div className="best-deal-badge">Best Deal</div>
      )}

      {/* Caution badge */}
      {isCaution && (
        <div className="caution-badge" title={cautionReason}>
          <FiAlertTriangle size={12} /> Caution
        </div>
      )}

      {/* Discount tag */}
      {discount > 0 && (
        <div className="discount-tag">-{discount}%</div>
      )}

      {/* Product Image */}
      <div className="card-image-wrapper">
        <img
          src={image || 'https://via.placeholder.com/200x200?text=No+Image'}
          alt={name}
          className="card-image"
          onError={(e) => { e.target.src = 'https://via.placeholder.com/200x200?text=No+Image'; }}
        />
        {/* Platform badge */}
        <span
          className="platform-badge"
          style={{ backgroundColor: getPlatformColor(platform) }}
        >
          {platform}
        </span>
      </div>

      {/* Product Info */}
      <div className="card-body">
        <h3 className="card-title" title={name}>
          {truncateText(name, 65)}
        </h3>

        <div className="card-price-row">
          <span className="card-price">{formatPriceWithPKR(displayPrice, price)}</span>
          {originalPrice > 0 && originalPrice > price && (
            <span className="card-original-price">
              ${originalPrice.toFixed(2)}
            </span>
          )}
        </div>

        {/* Rating, Reviews & Trust Score */}
        <div className="card-meta">
          {rating > 0 && (
            <span className="meta-rating">⭐ {rating.toFixed(1)}</span>
          )}
          {reviewCount > 0 && (
            <span className="meta-reviews">{reviewCount} reviews</span>
          )}
        </div>

        {/* Trust Score Bar */}
        {trustScore !== undefined && (
          <div className="trust-meter">
            <div className="trust-header">
              <span className="trust-label">Trust</span>
              <span className="trust-value" style={{ color: getScoreColor(trustScore) }}>
                {trustScore}/100
              </span>
            </div>
            <div className="trust-bar">
              <div
                className="trust-fill"
                style={{
                  width: `${trustScore}%`,
                  background: getScoreColor(trustScore)
                }}
              ></div>
            </div>
          </div>
        )}

        {/* Caution message */}
        {isCaution && cautionReason && (
          <div className="caution-message">
            <FiAlertTriangle size={12} />
            <span>{cautionReason}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="card-actions">
        <button className="btn-analyze" onClick={() => onAnalyze(product)}>
          <FiCpu /> AI Analysis
        </button>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-view"
          >
            <FiExternalLink /> View
          </a>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
