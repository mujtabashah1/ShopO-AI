/**
 * Enhanced Analysis Component
 * ---------------------------
 * Displays Python AI service results: advanced sentiment,
 * fake review detection, review summary, and trustworthiness score.
 */

import React, { useState } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiInfo, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { getScoreColor } from '../utils/helpers';
import './EnhancedAnalysis.css';

const EnhancedAnalysis = ({ data }) => {
  const [showFlagged, setShowFlagged] = useState(false);

  if (!data) return null;

  const { sentiment, fakeDetection, summary, trustworthiness, processingTimeMs } = data;

  return (
    <div className="enhanced-analysis">
      <h3 className="ea-title">
        Advanced AI Analysis
        <span className="ea-badge">Python AI</span>
        {processingTimeMs && <span className="ea-time">{processingTimeMs}ms</span>}
      </h3>

      {/* Trustworthiness Score */}
      {trustworthiness && (
        <div className="ea-section ea-trust">
          <div className="ea-trust-header">
            <div className="ea-trust-score" style={{ color: getScoreColor(trustworthiness.trustScore) }}>
              {trustworthiness.trustScore}
              <span className="ea-trust-max">/100</span>
            </div>
            <div className="ea-trust-info">
              <h4>Trustworthiness Score</h4>
              <p>{trustworthiness.recommendation}</p>
            </div>
          </div>

          {/* Score breakdown bars */}
          {trustworthiness.breakdown && (
            <div className="ea-breakdown">
              {trustworthiness.breakdown.map((item, i) => (
                <div className="ea-bar-row" key={i}>
                  <span className="ea-bar-label">{item.factor}</span>
                  <div className="ea-bar-track">
                    <div
                      className="ea-bar-fill"
                      style={{
                        width: `${(item.score / item.max) * 100}%`,
                        background: getScoreColor((item.score / item.max) * 100)
                      }}
                    />
                  </div>
                  <span className="ea-bar-value">{item.score}/{item.max}</span>
                </div>
              ))}
            </div>
          )}

          {/* Risk factors */}
          {trustworthiness.riskFactors && trustworthiness.riskFactors.length > 0 && (
            <div className="ea-risks">
              <h5><FiAlertTriangle /> Risk Factors</h5>
              <ul>
                {trustworthiness.riskFactors.map((risk, i) => (
                  <li key={i}>{risk}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Advanced Sentiment */}
      {sentiment && sentiment.totalReviews > 0 && (
        <div className="ea-section">
          <h4>
            Advanced Sentiment
            <span className={`ea-confidence ea-conf-${sentiment.confidence}`}>
              {sentiment.confidence} confidence
            </span>
          </h4>
          <div className="ea-sentiment-grid">
            <div className="ea-sent-item ea-sent-pos">
              <span className="ea-sent-pct">{sentiment.distribution?.positive || 0}%</span>
              <span className="ea-sent-label">Positive</span>
            </div>
            <div className="ea-sent-item ea-sent-neu">
              <span className="ea-sent-pct">{sentiment.distribution?.neutral || 0}%</span>
              <span className="ea-sent-label">Neutral</span>
            </div>
            <div className="ea-sent-item ea-sent-neg">
              <span className="ea-sent-pct">{sentiment.distribution?.negative || 0}%</span>
              <span className="ea-sent-label">Negative</span>
            </div>
          </div>
          <div className="ea-sent-meta">
            <span>Avg Ensemble: {sentiment.averageEnsemble?.toFixed(3)}</span>
            <span>Subjectivity: {(sentiment.averageSubjectivity * 100)?.toFixed(0)}%</span>
            <span>VADER/TextBlob Agreement: {sentiment.agreementPercentage}%</span>
          </div>
        </div>
      )}

      {/* Fake Review Detection */}
      {fakeDetection && fakeDetection.totalAnalyzed > 0 && (
        <div className="ea-section">
          <h4>
            Fake Review Detection
            {fakeDetection.fakePercentage <= 10 ? (
              <FiCheckCircle className="ea-icon-ok" />
            ) : (
              <FiAlertTriangle className="ea-icon-warn" />
            )}
          </h4>
          <div className="ea-fake-summary">
            <div className="ea-fake-stat">
              <span className="ea-fake-pct" style={{
                color: fakeDetection.fakePercentage > 30 ? '#e74c3c' :
                       fakeDetection.fakePercentage > 15 ? '#f39c12' : '#2ecc71'
              }}>
                {fakeDetection.fakePercentage}%
              </span>
              <span>Flagged as Suspicious</span>
            </div>
            <p className="ea-fake-assessment">{fakeDetection.overallAssessment}</p>
            {fakeDetection.duplicatePairs?.length > 0 && (
              <p className="ea-fake-dupes">
                <FiInfo /> {fakeDetection.duplicatePairs.length} near-duplicate review pair(s) found
              </p>
            )}
          </div>

          {/* Flagged reviews expandable */}
          {fakeDetection.flaggedReviews?.length > 0 && (
            <div className="ea-flagged">
              <button
                className="ea-flagged-toggle"
                onClick={() => setShowFlagged(!showFlagged)}
              >
                {showFlagged ? <FiChevronUp /> : <FiChevronDown />}
                {showFlagged ? 'Hide' : 'Show'} {fakeDetection.flaggedReviews.length} flagged review(s)
              </button>
              {showFlagged && (
                <div className="ea-flagged-list">
                  {fakeDetection.flaggedReviews.map((review, i) => (
                    <div className="ea-flagged-item" key={i}>
                      <div className="ea-flagged-score">
                        Fake Score: {(review.fakeScore * 100).toFixed(0)}%
                      </div>
                      <p className="ea-flagged-text">"{review.text}"</p>
                      <ul className="ea-flagged-reasons">
                        {review.reasons.map((r, j) => (
                          <li key={j}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Review Summary */}
      {summary && summary.overallSummary && (
        <div className="ea-section">
          <h4>AI Review Summary</h4>
          <p className="ea-summary-overall">{summary.overallSummary}</p>

          <div className="ea-summary-grid">
            {summary.positiveSummary && summary.positiveSummary !== 'No positive reviews found.' && (
              <div className="ea-summary-box ea-summary-pos">
                <h5>What buyers liked</h5>
                <p>{summary.positiveSummary}</p>
                {summary.keyPraises?.length > 0 && (
                  <div className="ea-tags">
                    {summary.keyPraises.map((p, i) => (
                      <span className="ea-tag ea-tag-pos" key={i}>{p}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {summary.negativeSummary && summary.negativeSummary !== 'No negative reviews found.' && (
              <div className="ea-summary-box ea-summary-neg">
                <h5>What buyers disliked</h5>
                <p>{summary.negativeSummary}</p>
                {summary.keyComplaints?.length > 0 && (
                  <div className="ea-tags">
                    {summary.keyComplaints.map((c, i) => (
                      <span className="ea-tag ea-tag-neg" key={i}>{c}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedAnalysis;
