/**
 * Review Authenticity Analysis (Cosine Similarity)
 * -------------------------------------------------
 * Three boxes:
 *   1. Duplicate Review Detection (text stats)
 *   2. Review-Product Relevance (text stats)
 *   3. Review Breakdown (bar chart — relevant vs irrelevant)
 */

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';

const COLORS = {
  relevant: '#3498db',
  irrelevant: '#e67e22',
};

const CosineSimilarityCharts = ({ cosineSimilarity, totalReviews = 0 }) => {
  if (!cosineSimilarity) return null;

  const { duplicates, relevance, penalty } = cosineSimilarity;

  const dupCount = duplicates?.duplicateCount || 0;
  const suspiciousPct = duplicates?.suspiciousPercentage || 0;
  const totalCmp = duplicates?.totalComparisons || 0;

  const avgRelevance = (relevance?.averageRelevance || 0) * 100;
  const irrelevantCount = relevance?.irrelevantCount || 0;
  const relevanceScore = relevance?.relevanceScore || 0;

  const effectiveTotal = totalReviews || relevance?.totalReviews || 0;
  const relevantCount = Math.max(0, effectiveTotal - irrelevantCount);

  const breakdownData = [
    { name: 'Relevant', count: relevantCount, fill: COLORS.relevant },
    { name: 'Irrelevant', count: irrelevantCount, fill: COLORS.irrelevant },
  ];

  return (
    <div className="analysis-card" style={{ marginBottom: '20px' }}>
      <h3>🔬 Review Authenticity Analysis (Cosine Similarity)</h3>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '12px' }}>
        {/* === Box 1: Duplicate Detection (text) === */}
        {duplicates && (
          <div style={{ flex: 1, minWidth: '250px', background: '#f8f9fa', borderRadius: '12px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', color: '#1a1a2e' }}>
              📋 Duplicate Review Detection
            </h4>
            <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#555' }}>
              <strong>Suspicious pairs:</strong> {dupCount}
            </p>
            <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#555' }}>
              <strong>Flagged reviews:</strong> {suspiciousPct}% of total
            </p>
            <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#555' }}>
              <strong>Total comparisons:</strong> {totalCmp}
            </p>
            {dupCount > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#dc3545', fontWeight: 500 }}>
                ⚠️ Some reviews are suspiciously similar — possible fake/copied reviews.
              </p>
            )}
            {dupCount === 0 && (
              <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#28a745', fontWeight: 500 }}>
                ✅ No duplicate reviews detected — reviews appear genuine.
              </p>
            )}
          </div>
        )}

        {/* === Box 2: Review-Product Relevance (text) === */}
        {relevance && (
          <div style={{ flex: 1, minWidth: '250px', background: '#f8f9fa', borderRadius: '12px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', color: '#1a1a2e' }}>
              🎯 Review-Product Relevance
            </h4>
            <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#555' }}>
              <strong>Average relevance:</strong> {avgRelevance.toFixed(1)}%
            </p>
            <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#555' }}>
              <strong>Irrelevant reviews:</strong> {irrelevantCount}
            </p>
            <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#555' }}>
              <strong>Relevance score:</strong> {relevanceScore}/25
            </p>
            {avgRelevance >= 8 && (
              <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#28a745', fontWeight: 500 }}>
                ✅ Reviews appear relevant to this product.
              </p>
            )}
            {avgRelevance > 0 && avgRelevance < 8 && (
              <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#ffc107', fontWeight: 500 }}>
                ⚠️ Some reviews may not be specifically about this product.
              </p>
            )}
          </div>
        )}

        {/* === Box 3: Review Breakdown (bar chart) === */}
        {relevance && (relevantCount > 0 || irrelevantCount > 0) && (
          <div style={{ flex: 1, minWidth: '250px', background: '#f8f9fa', borderRadius: '12px', padding: '16px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', color: '#1a1a2e' }}>
              📊 Review Breakdown
            </h4>
            <div style={{ height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={breakdownData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6c757d' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6c757d' }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {breakdownData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: '10px', height: '10px', background: COLORS.relevant, borderRadius: '50%' }} />
                <span style={{ color: '#6c757d' }}>Relevant: <strong style={{ color: '#1a1a2e' }}>{relevantCount}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', width: '10px', height: '10px', background: COLORS.irrelevant, borderRadius: '50%' }} />
                <span style={{ color: '#6c757d' }}>Irrelevant: <strong style={{ color: '#1a1a2e' }}>{irrelevantCount}</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* Penalty Info (full width) */}
        {penalty > 0 && (
          <div style={{ width: '100%', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem', color: '#856404' }}>
            ⚠️ Authenticity score reduced by <strong>{penalty} points</strong> due to suspicious review patterns.
          </div>
        )}
      </div>
    </div>
  );
};

export default CosineSimilarityCharts;
