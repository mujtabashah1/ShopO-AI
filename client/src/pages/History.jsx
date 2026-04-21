/**
 * History Page
 * ------------
 * Shows the user's past AI analyses, paginated.
 * Each entry links to the full analysis detail.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiClock, FiChevronLeft, FiChevronRight, FiCpu, FiExternalLink } from 'react-icons/fi';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { getVerdictColor, getScoreColor, timeAgo, truncateText, formatPrice } from '../utils/helpers';
import { toast } from 'react-toastify';
import './History.css';

const History = () => {
  const navigate = useNavigate();

  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchHistory = useCallback(async (pageNum) => {
    setLoading(true);
    try {
      const response = await api.get(`/analysis/history?page=${pageNum}&limit=10`);
      setAnalyses(response.data.analyses);
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.totalResults || 0);
    } catch (err) {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(page);
  }, [page, fetchHistory]);

  const handleViewDetail = async (analysisId) => {
    try {
      const response = await api.get(`/analysis/${analysisId}`);
      const analysis = response.data;

      // Navigate to product detail page with the analysis data pre-loaded
      navigate('/product', {
        state: {
          product: {
            name: analysis.productName,
            price: analysis.productPrice,
            image: analysis.productImage,
            link: analysis.productLink,
            platform: analysis.platform,
            displayPrice: formatPrice(analysis.productPrice, analysis.platform)
          },
          averagePrice: analysis.averagePrice || 0,
          preloadedAnalysis: analysis // Won't re-fetch if product detail supports this
        }
      });
    } catch (err) {
      toast.error('Failed to load analysis details');
    }
  };

  return (
    <div className="history-page">
      <div className="history-header">
        <div className="history-title-row">
          <FiClock size={28} />
          <div>
            <h1>Analysis History</h1>
            <p>{total} {total === 1 ? 'analysis' : 'analyses'} performed</p>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading your analysis history..." />
      ) : analyses.length === 0 ? (
        <div className="history-empty">
          <FiCpu size={48} />
          <h3>No Analyses Yet</h3>
          <p>Search for products and run AI analysis to see results here.</p>
          <button className="go-search-btn" onClick={() => navigate('/')}>
            Start Searching
          </button>
        </div>
      ) : (
        <>
          <div className="history-list">
            {analyses.map((item) => (
              <div
                key={item._id}
                className="history-item"
                onClick={() => handleViewDetail(item._id)}
              >
                <div className="history-item-image">
                  <img
                    src={item.productImage || 'https://via.placeholder.com/60x60?text=N/A'}
                    alt={item.productName}
                    onError={(e) => { e.target.src = 'https://via.placeholder.com/60x60?text=N/A'; }}
                  />
                </div>
                <div className="history-item-info">
                  <h4>{truncateText(item.productName, 80)}</h4>
                  <div className="history-item-meta">
                    <span className="history-platform">{item.platform}</span>
                    <span className="history-price">{formatPrice(item.productPrice, item.platform)}</span>
                    <span className="history-time">{timeAgo(item.createdAt)}</span>
                  </div>
                </div>
                <div className="history-item-score">
                  <div
                    className="score-circle"
                    style={{ borderColor: getScoreColor(item.authenticityScore) }}
                  >
                    <span style={{ color: getScoreColor(item.authenticityScore) }}>
                      {item.authenticityScore}
                    </span>
                  </div>
                </div>
                <div className="history-item-verdict">
                  <span
                    className="verdict-pill"
                    style={{
                      background: `${getVerdictColor(item.verdict)}18`,
                      color: getVerdictColor(item.verdict),
                      borderColor: getVerdictColor(item.verdict)
                    }}
                  >
                    {item.verdict}
                  </span>
                </div>
                <div className="history-item-action">
                  <FiExternalLink size={18} />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="history-pagination">
              <button
                className="page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <FiChevronLeft /> Previous
              </button>
              <span className="page-info">
                Page {page} of {totalPages}
              </span>
              <button
                className="page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <FiChevronRight />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default History;
