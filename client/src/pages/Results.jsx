/**
 * Results Page
 * ------------
 * Displays search results in a responsive card grid.
 * Uses Server-Sent Events (SSE) to stream results progressively —
 * products appear as each platform finishes scraping.
 *
 * Receives search params via React Router location.state:
 *   { query: string, platforms: string[] }
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiSearch, FiFilter, FiAlertCircle, FiRefreshCw, FiDatabase, FiZap, FiLoader } from 'react-icons/fi';
import ProductCard from '../components/ProductCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-toastify';
import { timeAgo } from '../utils/helpers';
import './Results.css';

const Results = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = location.state || {};
  const { query = '', platforms: initialPlatforms = [] } = searchParams;

  const platformsKey = initialPlatforms.join(',');

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [platformResults, setPlatformResults] = useState({});
  const [isCached, setIsCached] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [scrapeMethod, setScrapeMethod] = useState(null);
  const [activePlatforms, setActivePlatforms] = useState(new Set());
  const [aiFiltering, setAiFiltering] = useState(false);

  const eventSourceRef = useRef(null);

  // Close any active SSE connection
  const closeStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Fetch products via SSE stream
  const fetchProducts = useCallback((forceRefresh = false) => {
    if (!query) {
      navigate('/');
      return;
    }

    // Close existing stream
    closeStream();

    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setProducts([]);
    setPlatformResults({});
    setIsCached(false);
    setCachedAt(null);
    setScrapeMethod(null);
    setActivePlatforms(new Set());
    setStreaming(true);

    // Build SSE URL with auth token
    const token = localStorage.getItem('smartshop_token');
    const params = new URLSearchParams({
      q: query,
      ...(platformsKey && { platforms: platformsKey }),
      ...(forceRefresh && { forceRefresh: 'true' }),
      token // pass token as query param for SSE (no custom headers with EventSource)
    });

    const url = `http://localhost:5000/api/products/search/stream?${params}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    // --- Cached response: full data arrives at once ---
    es.addEventListener('cached', (e) => {
      const data = JSON.parse(e.data);
      setProducts(data.products || []);
      setIsCached(true);
      setCachedAt(data.cachedAt || null);
      setScrapeMethod('cache');
      setLoading(false);
      setRefreshing(false);
      setStreaming(false);
      closeStream();
    });

    // --- Search started ---
    es.addEventListener('search_start', (e) => {
      const data = JSON.parse(e.data);
      setLoading(false);  // Stop the full-page spinner — show streaming UI instead
      setActivePlatforms(new Set(data.platforms));
    });

    // --- A platform started scraping ---
    es.addEventListener('platform_start', (e) => {
      const data = JSON.parse(e.data);
      setPlatformResults(prev => ({
        ...prev,
        [data.platform]: { status: 'scraping', count: 0 }
      }));
    });

    // --- A platform is being AI-filtered ---
    es.addEventListener('platform_ai_start', (e) => {
      const data = JSON.parse(e.data);
      setPlatformResults(prev => ({
        ...prev,
        [data.platform]: { status: 'ai_filtering', count: data.count }
      }));
    });

    // --- A platform finished — products arrive ---
    es.addEventListener('platform_done', (e) => {
      const data = JSON.parse(e.data);

      // Add this platform's products to the running list
      if (data.products && data.products.length > 0) {
        setProducts(prev => [...prev, ...data.products]);
      }

      // Update platform status
      setPlatformResults(prev => ({
        ...prev,
        [data.platform]: {
          status: data.status === 'success' ? 'success' : 'failed',
          count: data.count,
          rawCount: data.rawCount,
          heuristicRejected: data.heuristicRejected,
          error: data.error
        }
      }));

      // Remove from active set
      setActivePlatforms(prev => {
        const next = new Set(prev);
        next.delete(data.platform);
        return next;
      });
    });

    // --- AI filtering started ---
    es.addEventListener('ai_filtering_start', (e) => {
      setAiFiltering(true);
    });

    // --- AI filtering finished ---
    es.addEventListener('ai_filtering_done', (e) => {
      setAiFiltering(false);
    });

    // --- All platforms done — final scored results ---
    es.addEventListener('search_complete', (e) => {
      const data = JSON.parse(e.data);

      // Replace with final scored/sorted products (includes trustScore, bestDeal, etc.)
      setProducts(data.products || []);
      setPlatformResults(data.platformResults || {});
      setScrapeMethod(data.scrapeMethod || 'puppeteer');
      setStreaming(false);
      setRefreshing(false);
      setActivePlatforms(new Set());
      setAiFiltering(false);

      if (data.totalProducts === 0) {
        setError('No products found. Try a different search term.');
      }

      if (forceRefresh) {
        toast.success(`Refreshed! ${data.totalProducts} products found.`);
      }

      closeStream();
    });

    // --- Error ---
    es.addEventListener('error', (e) => {
      // EventSource fires generic errors on connection issues
      if (e.data) {
        const data = JSON.parse(e.data);
        setError(data.message);
        toast.error(data.message);
      }
      setLoading(false);
      setRefreshing(false);
      setStreaming(false);
      closeStream();
    });

    // Native EventSource error (connection dropped, etc.)
    es.onerror = () => {
      // Only show error if we haven't received any data yet
      if (products.length === 0 && !isCached) {
        // EventSource auto-reconnects — close it to stop retry
        closeStream();
        setStreaming(false);
        setLoading(false);
        setRefreshing(false);
      }
    };

  }, [query, platformsKey, navigate, closeStream]);

  useEffect(() => {
    fetchProducts(false);
    return () => closeStream(); // cleanup on unmount
  }, [fetchProducts, closeStream]);

  const handleRefresh = () => {
    if (refreshing || loading) return;
    fetchProducts(true);
  };

  const handleAnalyze = (product) => {
    const avgPrice = products.length > 0
      ? products.reduce((sum, p) => sum + p.price, 0) / products.length
      : product.price;
    navigate('/product', { state: { product, averagePrice: avgPrice, allProducts: products } });
  };

  const filteredProducts = platformFilter === 'all'
    ? products
    : products.filter(p => p.platform.toLowerCase() === platformFilter);

  const availablePlatforms = [...new Set(products.map(p => p.platform))];

  // Count how many platforms are still scraping
  const scrapingCount = activePlatforms.size;

  return (
    <div className="results-page">
      {/* Search info bar */}
      <div className="results-header">
        <div className="results-header-content">
          <div className="results-header-left">
            <h1 className="results-title">
              <FiSearch /> Results for "{query}"
            </h1>
            <p className="results-count">
              {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
              {streaming && scrapingCount > 0 && (
                <span className="streaming-badge">
                  <FiLoader className="spin-icon" />
                  {scrapingCount} platform{scrapingCount !== 1 ? 's' : ''} still loading...
                </span>
              )}
              {aiFiltering && (
                <span className="streaming-badge" style={{ background: 'rgba(155, 89, 182, 0.1)', color: '#9b59b6' }}>
                  <FiLoader className="spin-icon" />
                  AI filtering for relevance...
                </span>
              )}
            </p>
          </div>

          {/* Cache controls */}
          <div className="cache-controls">
            {!loading && products.length > 0 && !streaming && (
              <>
                <div className={`cache-badge ${isCached ? 'cached' : 'fresh'}`}>
                  {isCached ? <FiDatabase size={14} /> : <FiZap size={14} />}
                  <span>{isCached ? 'From Cache' : 'Fresh Results'}</span>
                  {isCached && cachedAt && (
                    <span className="cache-time">({timeAgo(cachedAt)})</span>
                  )}
                </div>
                {scrapeMethod && scrapeMethod !== 'cache' && (
                  <div className={`cache-badge ${scrapeMethod === 'extension' || scrapeMethod === 'hybrid' ? 'fresh' : 'cached'}`} style={{ marginLeft: '6px' }}>
                    <span>{scrapeMethod === 'hybrid' ? 'Hybrid' : scrapeMethod === 'extension' ? 'Via Extension' : 'Via Scraper'}</span>
                  </div>
                )}
              </>
            )}

            {!loading && (products.length > 0 || !streaming) && (
              <button
                className={`btn-refresh ${refreshing ? 'spinning' : ''}`}
                onClick={handleRefresh}
                disabled={refreshing || streaming}
                title="Force refresh — re-scrape all platforms for latest data"
              >
                <FiRefreshCw className="refresh-icon" />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="results-container">
        {/* Sidebar Filters */}
        <aside className="filters-sidebar">
          <h3 className="filter-title">
            <FiFilter /> Filters
          </h3>

          {/* Platform filter */}
          <div className="filter-group">
            <h4>Platform</h4>
            <label className={`filter-option ${platformFilter === 'all' ? 'active' : ''}`}>
              <input
                type="radio"
                name="platform"
                checked={platformFilter === 'all'}
                onChange={() => setPlatformFilter('all')}
              />
              All Platforms ({products.length})
            </label>
            {availablePlatforms.map(platform => {
              const count = products.filter(p => p.platform === platform).length;
              return (
                <label
                  key={platform}
                  className={`filter-option ${platformFilter === platform.toLowerCase() ? 'active' : ''}`}
                >
                  <input
                    type="radio"
                    name="platform"
                    checked={platformFilter === platform.toLowerCase()}
                    onChange={() => setPlatformFilter(platform.toLowerCase())}
                  />
                  {platform} ({count})
                </label>
              );
            })}
          </div>

          {/* Data source info */}
          <div className="filter-group">
            <h4>Data Source</h4>
            <div className="data-source-info">
              {isCached ? (
                <p className="source-text">
                  <FiDatabase size={14} />
                  Showing cached results.
                  {cachedAt && <><br /><small>Cached {timeAgo(cachedAt)}</small></>}
                </p>
              ) : (
                <p className="source-text">
                  <FiZap size={14} />
                  {streaming ? 'Scraping in progress...' : 'Showing freshly scraped data.'}
                </p>
              )}
              <button
                className="btn-sidebar-refresh"
                onClick={handleRefresh}
                disabled={refreshing || loading || streaming}
              >
                <FiRefreshCw size={14} />
                {refreshing ? 'Refreshing...' : 'Get Fresh Data'}
              </button>
            </div>
          </div>

          {/* Platform status — shows live scraping progress */}
          {Object.keys(platformResults).length > 0 && (
            <div className="filter-group">
              <h4>Scraping Status</h4>
              {Object.entries(platformResults).map(([platform, result]) => (
                <div key={platform} className="platform-status">
                  <span className={`status-dot ${result.status}`}></span>
                  <span>
                    {platform}:{' '}
                    {result.status === 'scraping' ? (
                      <em className="scraping-text">scraping...</em>
                    ) : result.status === 'ai_filtering' ? (
                      <em className="scraping-text" style={{ color: '#9b59b6' }}>AI filtering ({result.count})...</em>
                    ) : (
                      <>
                        {result.count} found
                        {result.heuristicRejected > 0 && (
                          <span style={{ color: '#999', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                            ({result.heuristicRejected} accessories filtered)
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="results-main">
          {loading ? (
            <LoadingSpinner message="Connecting to scrapers..." />
          ) : error && products.length === 0 && !streaming ? (
            <div className="empty-state">
              <FiAlertCircle size={48} />
              <h3>No Results</h3>
              <p>{error}</p>
              <button className="btn-back-home" onClick={() => navigate('/')}>
                Try Another Search
              </button>
            </div>
          ) : (
            <>
              <div className="products-grid">
                {filteredProducts.map((product, index) => (
                  <ProductCard
                    key={`${product.platform}-${product.link || index}-${index}`}
                    product={product}
                    onAnalyze={handleAnalyze}
                  />
                ))}
              </div>

              {/* Streaming indicator at bottom */}
              {streaming && scrapingCount > 0 && (
                <div className="streaming-indicator">
                  <FiLoader className="spin-icon" />
                  <span>Loading more results from {scrapingCount} platform{scrapingCount !== 1 ? 's' : ''}...</span>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default Results;
