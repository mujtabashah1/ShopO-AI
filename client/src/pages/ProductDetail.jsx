/**
 * Product Detail Page (AI Analysis Dashboard)
 * -------------------------------------------
 * THE MAIN FEATURE PAGE OF THE FYP.
 * 
 * Displays comprehensive AI analysis of a product:
 *   - Product info (image, name, price, original price, discount, platform)
 *   - "Lowest Price" label if cheapest across platforms
 *   - Authenticity score gauge
 *   - Verdict badge (Buy / Risky / Avoid)
 *   - Score breakdown bars (price, seller, review, sentiment)
 *   - Circular sentiment progress + pie chart
 *   - Individual review sentiments
 *   - AI suggestion text with scam detection notes
 *   - "Visit Store" and "Verify Authenticity" action buttons
 * 
 * Receives product data via React Router location.state
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiExternalLink, FiCpu, FiShield, FiAlertTriangle } from 'react-icons/fi';
import api from '../services/api';
import AuthenticityGauge from '../components/AuthenticityGauge';
import AIVerdictBadge from '../components/AIVerdictBadge';
import SentimentChart from '../components/SentimentChart';
import ReviewList from '../components/ReviewList';
import LoadingSpinner from '../components/LoadingSpinner';
import EnhancedAnalysis from '../components/EnhancedAnalysis';
import CosineSimilarityCharts from '../components/CosineSimilarityCharts';
import { getPlatformColor, getScoreColor, formatPrice } from '../utils/helpers';
import { toast } from 'react-toastify';
import './ProductDetail.css';

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

const ProductDetail = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const { product, averagePrice, preloadedAnalysis, allProducts } = location.state || {};

  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  // Check if this product is the lowest price across all results
  const isLowestPrice = allProducts && allProducts.length > 1
    ? product.price <= Math.min(...allProducts.map(p => p.price))
    : false;

  // Run AI analysis on mount
  const runAnalysis = useCallback(async () => {
    if (!product) {
      navigate('/');
      return;
    }

    if (preloadedAnalysis) {
      setAnalysis(preloadedAnalysis);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/analysis/analyze', {
        productName: product.name,
        productPrice: product.price,
        productImage: product.image,
        productLink: product.link,
        platform: product.platform,
        averagePrice: averagePrice || 0,
        sellerRating: product.sellerRating || product.rating || 0,
        reviewCount: product.reviewCount || 0,
        reviews: product.reviews || []
      });

      setAnalysis(response.data);
    } catch (err) {
      const message = err.response?.data?.message || 'Analysis failed. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [product, averagePrice, preloadedAnalysis, navigate]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  if (!product) {
    return null;
  }

  // Score breakdown bar component
  const ScoreBar = ({ label, value, max = 25 }) => {
    const percentage = (value / max) * 100;
    return (
      <div className="score-bar-item">
        <div className="score-bar-header">
          <span className="score-bar-label">{label}</span>
          <span className="score-bar-value" style={{ color: getScoreColor((value / max) * 100) }}>
            {value}/{max}
          </span>
        </div>
        <div className="score-bar-track">
          <div
            className="score-bar-fill"
            style={{
              width: `${percentage}%`,
              background: getScoreColor((value / max) * 100)
            }}
          />
        </div>
      </div>
    );
  };

  // Circular progress for sentiment
  const SentimentCircle = ({ percentage, label, color }) => {
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    return (
      <div className="sentiment-circle-item">
        <svg className="sentiment-circle-svg" width="90" height="90" viewBox="0 0 90 90">
          <circle cx="45" cy="45" r={radius} fill="none" stroke="#f0f0f0" strokeWidth="6" />
          <circle
            cx="45" cy="45" r={radius} fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
          <text x="45" y="45" textAnchor="middle" dominantBaseline="central"
            className="circle-text" style={{ fill: color }}
          >
            {percentage}%
          </text>
        </svg>
        <span className="circle-label">{label}</span>
      </div>
    );
  };

  return (
    <div className="detail-page">
      {/* Back Button */}
      <button className="back-btn" onClick={() => navigate(-1)}>
        <FiArrowLeft /> Back to Results
      </button>

      {/* Product Info Header */}
      <div className="product-info-card">
        <div className="product-info-image">
          <img
            src={product.image || 'https://via.placeholder.com/300x300?text=No+Image'}
            alt={product.name}
            onError={(e) => { e.target.src = 'https://via.placeholder.com/300x300?text=No+Image'; }}
          />
        </div>
        <div className="product-info-details">
          <div className="product-top-tags">
            <span
              className="product-platform-tag"
              style={{ background: getPlatformColor(product.platform) }}
            >
              {product.platform}
            </span>
            {isLowestPrice && (
              <span className="lowest-price-tag">⚡ Lowest Price</span>
            )}
            {product.isBestDeal && (
              <span className="best-deal-tag">🏆 Best Deal</span>
            )}
            {product.isCaution && (
              <span className="caution-tag">
                <FiAlertTriangle size={12} /> Caution
              </span>
            )}
          </div>

          <h1 className="product-name">{product.name}</h1>

          {/* Price section */}
          <div className="price-section">
            {/* Show corrected price if analysis found a different one */}
            {analysis && analysis.priceNote ? (
              <>
                <span className="product-price">{formatPriceWithPKR(`$${analysis.productPrice.toFixed(2)}`, analysis.productPrice)}</span>
                {analysis.originalSearchPrice > 0 && analysis.originalSearchPrice !== analysis.productPrice && (
                  <span className="product-original-price" style={{ textDecoration: 'line-through', color: '#999', fontSize: '0.9em', marginLeft: '8px' }}>
                    ${analysis.originalSearchPrice.toFixed(2)} (search result)
                  </span>
                )}
              </>
            ) : (
              <span className="product-price">{formatPriceWithPKR(product.displayPrice, product.price)}</span>
            )}
            {product.originalPrice > 0 && product.originalPrice > product.price && !analysis?.priceNote && (
              <>
                <span className="product-original-price">
                  {formatPrice(product.originalPrice, product.platform)}
                </span>
                <span className="product-discount-badge">
                  -{product.discount || Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
                </span>
              </>
            )}
          </div>

          {/* Price correction notice */}
          {analysis && analysis.priceNote && (
            <div className="price-correction-notice" style={{
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '12px',
              fontSize: '0.85em',
              color: '#856404',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px'
            }}>
              <FiAlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{analysis.priceNote}</span>
            </div>
          )}

          {/* Average comparison */}
          {averagePrice > 0 && (
            <div className="price-comparison">
              {(() => {
                // Use verified price from analysis if available
                const comparePrice = (analysis && analysis.productPrice) ? analysis.productPrice : product.price;
                if (comparePrice < averagePrice) {
                  return (
                    <span className="price-below">
                      ${(averagePrice - comparePrice).toFixed(2)} below average ({formatPrice(averagePrice, product.platform)})
                    </span>
                  );
                } else if (comparePrice > averagePrice) {
                  return (
                    <span className="price-above">
                      ${(comparePrice - averagePrice).toFixed(2)} above average ({formatPrice(averagePrice, product.platform)})
                    </span>
                  );
                } else {
                  return <span className="price-average">At average price</span>;
                }
              })()}
            </div>
          )}

          <div className="product-meta-row">
            {product.rating > 0 && <span>⭐ {product.rating.toFixed(1)} rating</span>}
            {product.reviewCount > 0 && <span>{product.reviewCount} reviews</span>}
            {product.trustScore !== undefined && (
              <span style={{ color: getScoreColor(product.trustScore) }}>
                🛡️ Trust: {product.trustScore}/100
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="product-action-buttons">
            {product.link && (
              <a
                href={product.link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-visit-store"
              >
                <FiExternalLink /> Visit Store
              </a>
            )}
            <button
              className={`btn-verify-auth ${verifying ? 'verifying' : ''} ${verifyResult ? 'verified' : ''}`}
              onClick={async () => {
                if (verifying) return;
                setVerifying(true);
                setVerifyResult(null);
                try {
                  const res = await api.post('/analysis/verify-url', {
                    imageUrl: product.image,
                    category: 'electronics'
                  });
                  setVerifyResult(res.data);
                  toast.success(`Verification: ${res.data.status} (${res.data.confidenceScore}%)`);
                } catch (err) {
                  toast.error(err.response?.data?.message || 'Verification failed.');
                } finally {
                  setVerifying(false);
                }
              }}
              disabled={verifying || !product.image}
            >
              <FiShield /> {verifying ? 'Verifying...' : verifyResult ? `${verifyResult.status} (${verifyResult.confidenceScore}%)` : 'Verify Authenticity'}
            </button>
          </div>

          {/* Inline Verification Result */}
          {verifyResult && (
            <div className={`verify-inline-result status-${verifyResult.status.toLowerCase()}`}>
              <div className="verify-inline-header">
                <FiShield size={18} />
                <strong>{verifyResult.status}</strong>
                <span className="verify-confidence">{verifyResult.confidenceScore}% confidence</span>
              </div>
              <p className="verify-inline-text">{verifyResult.statusExplanation}</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis Section */}
      {loading ? (
        <LoadingSpinner message="Running AI Analysis... Evaluating authenticity and sentiment." />
      ) : error ? (
        <div className="analysis-error">
          <h3>Analysis Failed</h3>
          <p>{error}</p>
          <button onClick={runAnalysis} className="retry-btn">
            <FiCpu /> Retry Analysis
          </button>
        </div>
      ) : analysis ? (
        <div className="analysis-results">
          {/* Section Title */}
          <div className="analysis-section-title">
            <FiCpu size={24} />
            <h2>AI Analysis Results</h2>
          </div>

          {/* Top Row: Gauge + Verdict */}
          <div className="analysis-top-row">
            <div className="analysis-card gauge-card">
              <h3>Authenticity Score</h3>
              <AuthenticityGauge score={analysis.authenticityScore} />
            </div>

            <div className="analysis-card verdict-card">
              <AIVerdictBadge
                verdict={analysis.verdict}
                suggestion={analysis.suggestion}
              />
            </div>
          </div>

          {/* Middle Row: Score Breakdown + Sentiment */}
          <div className="analysis-middle-row">
            {/* Score Breakdown */}
            <div className="analysis-card breakdown-card">
              <h3>Score Breakdown</h3>
              <p className="breakdown-subtitle">
                Each factor is scored 0-25 points. Total: {analysis.authenticityScore}/100
              </p>
              <div className="score-bars">
                <ScoreBar label="Price Analysis" value={analysis.breakdown.priceScore} />
                <ScoreBar label="Seller Rating" value={analysis.breakdown.sellerScore} />
                <ScoreBar label="Review Count" value={analysis.breakdown.reviewScore} />
                <ScoreBar label="Sentiment Score" value={analysis.breakdown.sentimentScore} />
              </div>

              {analysis.breakdownDetails && (
                <div className="breakdown-explanations">
                  {Object.entries(analysis.breakdownDetails).map(([key, detail]) => (
                    <div key={key} className="explanation-item">
                      <span className="explanation-score" style={{ color: getScoreColor((detail.value / detail.max) * 100) }}>
                        {detail.value}/{detail.max}
                      </span>
                      <span className="explanation-text">{detail.explanation}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sentiment Section */}
            <div className="analysis-card sentiment-card">
              <h3>Sentiment Analysis</h3>

              {analysis.sentimentDetails?.totalReviews === 0 ? (
                <div className="no-reviews-placeholder">
                  <span className="no-reviews-icon">📝</span>
                  <p className="no-reviews-title">No Reviews Found</p>
                  <p className="no-reviews-text">
                    This product has no user reviews available for sentiment analysis.
                    The review section on the product page is empty — this may indicate a new listing or low sales volume.
                  </p>
                </div>
              ) : (
                <>
                  {/* Circular progress indicators */}
                  {analysis.sentimentBreakdown && (
                    <div className="sentiment-circles">
                      <SentimentCircle
                        percentage={analysis.sentimentBreakdown.positive || 0}
                        label="Positive"
                        color="#28a745"
                      />
                      <SentimentCircle
                        percentage={analysis.sentimentBreakdown.neutral || 0}
                        label="Neutral"
                        color="#ffc107"
                      />
                      <SentimentCircle
                        percentage={analysis.sentimentBreakdown.negative || 0}
                        label="Negative"
                        color="#dc3545"
                      />
                    </div>
                  )}

                  <SentimentChart sentimentData={analysis.sentimentBreakdown} />

                  {analysis.sentimentDetails?.note && (
                    <p className="sentiment-note">{analysis.sentimentDetails.note}</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* AI Verdict Summary */}
          <div className="analysis-card verdict-summary-card">
            <h3>🤖 AI Verdict Summary</h3>
            <div className="verdict-summary-content">
              <p className="verdict-main-text">
                <strong>Overall Assessment:</strong> This product received a score of <strong
                  style={{ color: getScoreColor(analysis.authenticityScore) }}
                >{analysis.authenticityScore}/100</strong> with a verdict of <strong
                  style={{ color: analysis.verdict === 'Buy' ? '#28a745' : analysis.verdict === 'Avoid' ? '#dc3545' : '#ffc107' }}
                >"{analysis.verdict}"</strong>.
              </p>

              {analysis.suggestion && (
                <p className="verdict-suggestion">{analysis.suggestion}</p>
              )}

              <div className="verdict-insights">
                <div className="insight-item">
                  <span className="insight-icon">📊</span>
                  <span>
                    <strong>Review Genuineness:</strong> {
                      analysis.sentimentDetails?.totalReviews === 0
                        ? 'No user reviews available for this product. Sentiment could not be evaluated.'
                        : analysis.sentimentBreakdown?.positive >= 70
                          ? 'Reviews appear largely genuine with consistent positive sentiment.'
                          : analysis.sentimentBreakdown?.negative >= 40
                            ? 'High negative sentiment detected — reviews suggest significant quality concerns.'
                            : 'Mixed review sentiment — some reviews may require further scrutiny.'
                    }
                  </span>
                </div>
                <div className="insight-item">
                  <span className="insight-icon">🔍</span>
                  <span>
                    <strong>Scam Detection:</strong> {
                      analysis.authenticityScore >= 70
                        ? 'No significant scam indicators detected. This listing appears legitimate.'
                        : analysis.authenticityScore >= 45
                          ? 'Some risk indicators present. Verify seller reputation before purchasing.'
                          : 'Multiple risk indicators detected. This listing has characteristics common in fraudulent listings.'
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Cosine Similarity Analysis — graphical charts */}
          {analysis.cosineSimilarity && (
            <CosineSimilarityCharts
              cosineSimilarity={analysis.cosineSimilarity}
              totalReviews={analysis.analyzedReviews?.length || 0}
            />
          )}

          {/* Bottom: Individual Reviews */}
          <div className="analysis-card reviews-card">
            <ReviewList reviews={analysis.analyzedReviews} />
          </div>

          {/* Enhanced AI Analysis (Python service) */}
          {analysis.enhancedAnalysis && (
            <div className="analysis-card">
              <EnhancedAnalysis data={analysis.enhancedAnalysis} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default ProductDetail;
