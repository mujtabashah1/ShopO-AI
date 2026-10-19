/**
 * Home Page
 * ---------
 * Landing page with a hero section, search bar, platform selection,
 * and feature highlights. Users can search for products from here.
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiCpu, FiBarChart2, FiShield, FiCamera, FiArrowUpRight, FiCheck, FiArrowRight } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import api from '../services/api';
import './Home.css';

// Feature cards shown below the search bar
const features = [
  {
    icon: FiCpu,
    title: 'AI Analysis',
    description: 'Understand shopping risks through price comparisons, seller ratings, and review analysis.'
  },
  {
    icon: FiBarChart2,
    title: 'Sentiment Analysis',
    description: 'NLP-powered review analysis to determine overall buyer satisfaction.'
  },
  {
    icon: FiShield,
    title: 'Smart Verdict',
    description: 'Clear Buy / Risky / Avoid recommendations based on multiple trust factors.'
  }
];

const Home = () => {
  const [query, setQuery] = useState('');
  const [platforms, setPlatforms] = useState({
    aliexpress: true,
    ebay: true,
    amazon: true,
    daraz: true
  });
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Image-search state
  const [imageSearching, setImageSearching] = useState(false);
  const fileInputRef = useRef(null);

  // Toggle a platform checkbox
  const togglePlatform = (platform) => {
    setPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  };

  // Handle image upload → Gemini → search
  const handleImageSearch = async (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be smaller than 10MB.');
      return;
    }

    if (!isAuthenticated) {
      toast.info('Please login to search.');
      navigate('/login');
      return;
    }

    const selectedPlatforms = Object.entries(platforms)
      .filter(([_, active]) => active)
      .map(([name]) => name);
    if (selectedPlatforms.length === 0) {
      toast.warning('Please select at least one platform first.');
      return;
    }

    setImageSearching(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const { data } = await api.post('/products/identify-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (!data.query) {
        toast.error('Could not identify product from image.');
        return;
      }

      toast.success(`Detected: ${data.query} — searching...`);

      navigate('/results', {
        state: { query: data.query, platforms: selectedPlatforms }
      });
    } catch (err) {
      const msg = err.response?.data?.message || 'Image search failed. Try a different image.';
      toast.error(msg);
    } finally {
      setImageSearching(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle search form submission
  const handleSearch = (e) => {
    e.preventDefault();

    if (!query.trim()) {
      toast.warning('Please enter a product to search for.');
      return;
    }

    // Check if at least one platform is selected
    const selectedPlatforms = Object.entries(platforms)
      .filter(([_, active]) => active)
      .map(([name]) => name);

    if (selectedPlatforms.length === 0) {
      toast.warning('Please select at least one platform.');
      return;
    }

    // If not logged in, redirect to login
    if (!isAuthenticated) {
      toast.info('Please login to search for products.');
      navigate('/login');
      return;
    }

    // Navigate to results page with search parameters
    navigate('/results', {
      state: {
        query: query.trim(),
        platforms: selectedPlatforms
      }
    });
  };

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-eyebrow"><span /> A little intelligence. A better purchase.</div>
          <h1 className="hero-title">
            Find what you love.<br />
            <span className="hero-highlight">Know what you buy.</span>
          </h1>
          <p className="hero-subtitle">
            A second opinion for your next purchase. Compare prices, understand
            reviews, and spot the red flags before you checkout.
          </p>

          {/* Search Form */}
          <form className="search-form" onSubmit={handleSearch}>
            <label className="search-label" htmlFor="product-search">What’s on your wishlist?</label>
            <div className="search-input-wrapper">
              <FiSearch className="search-icon" />
              <input
                id="product-search"
                type="text"
                className="search-input"
                placeholder="Try wireless headphones or an iPhone…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="search-btn" disabled={imageSearching}>
                {imageSearching ? 'Identifying...' : <>Search <FiArrowRight /></>}
              </button>
            </div>

            {/* Platform Selection */}
            <div className="platform-selection">
              <span className="platform-label">Compare on</span>
              {Object.entries(platforms).map(([name, active]) => (
                <label key={name} className={`platform-chip ${active ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => togglePlatform(name)}
                    className="platform-checkbox"
                  />
                  <span className="chip-name">
                    {active && <FiCheck aria-hidden="true" />}
                    {{ aliexpress: 'AliExpress', ebay: 'eBay', amazon: 'Amazon', daraz: 'Daraz' }[name]}
                  </span>
                </label>
              ))}
            </div>
          </form>

          {/* Search by Image Button — uses Gemini Vision to identify the product */}
          <button
            type="button"
            className="image-search-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={imageSearching}
          >
            <FiCamera className="image-search-icon" />
            <span>{imageSearching ? 'Identifying product...' : 'Search by Image'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleImageSearch(e.target.files?.[0])}
          />
          <div className="popular-searches"><span>A little inspiration</span>{['Headphones', 'Smart watch', 'Sneakers'].map(term => <button key={term} type="button" onClick={() => setQuery(term)}>{term} <FiArrowUpRight /></button>)}</div>
        </div>
        <div className="hero-preview" aria-label="Illustrative product analysis">
          <div className="preview-topline"><span><FiShield /> The purchase, decoded</span><span className="example-label">Example analysis</span></div>
          <div className="preview-product">
            <div className="preview-orbit" />
            <svg className="headphone-art" viewBox="0 0 300 260" fill="none" aria-hidden="true">
              <defs><linearGradient id="headband" x1="65" y1="30" x2="245" y2="230" gradientUnits="userSpaceOnUse"><stop stopColor="#46524d"/><stop offset="1" stopColor="#0e1915"/></linearGradient></defs>
              <ellipse cx="154" cy="236" rx="86" ry="9" fill="#102a20" opacity=".09"/>
              <path d="M62 159V113a88 88 0 0 1 176 0v46" stroke="#17251e" strokeWidth="22" strokeLinecap="round"/>
              <path d="M65 116a85 85 0 0 1 170 0" stroke="#738079" strokeWidth="5" strokeLinecap="round"/>
              <path d="M63 112v66M237 112v66" stroke="#96a29a" strokeWidth="9"/>
              <rect x="41" y="137" width="52" height="87" rx="24" fill="url(#headband)" transform="rotate(-8 41 137)"/>
              <rect x="209" y="130" width="52" height="87" rx="24" fill="url(#headband)" transform="rotate(8 209 130)"/>
              <path d="M57 154v45M244 151v45" stroke="#69766e" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            <span className="preview-category">EVERYDAY ESSENTIALS</span>
          </div>
          <div className="preview-info"><div><h3>Wireless headphones</h3><p>Look beyond the product page.</p></div><span className="preview-check"><FiCheck /></span></div>
          <div className="preview-signals"><div><FiBarChart2 /><span>Price comparison<small>See the bigger picture</small></span><FiArrowUpRight /></div><div><FiCpu /><span>Review insights<small>Separate signals from noise</small></span><FiArrowUpRight /></div></div>
          <div className="preview-note"><FiShield /> More confidence. Fewer surprises.</div>
        </div>
      </section>

      <section className="platform-strip" aria-label="Supported marketplaces"><span>One search. Four marketplaces.</span><div><strong className="market-amazon">amazon<span>⌣</span></strong><strong className="market-ebay"><i>e</i><i>b</i><i>a</i><i>y</i></strong><strong>AliExpress</strong><strong className="market-daraz">daraz</strong></div></section>

      {/* Features Section */}
      <section className="features-section">
        <div className="section-heading"><div><span className="section-eyebrow">SHOP WITH A CLEARER PICTURE</span><h2 className="section-title">Good decisions start with better insights.</h2></div><p>From the first search to the final verdict,<br />get a little clarity at every step.</p></div>
        <div className="features-grid">
          {features.map((feature, index) => (
            <div key={index} className="feature-card">
              <div className="feature-icon-wrapper">
                <feature.icon size={28} />
              </div>
              <span className="feature-number">0{index + 1}</span>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-description">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="stat-item">
          <span className="stat-number">4</span>
          <span className="stat-label">Platforms Supported</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">100</span>
          <span className="stat-label">Point Scoring System</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">4</span>
          <span className="stat-label">AI Trust Factors</span>
        </div>
      </section>
      <footer className="home-footer">
        <span>ShopO-AI <small>Shopping, with a second opinion.</small></span>
        <span>Made for more thoughtful purchases.</span>
        <a className="targlabs-credit" href="https://www.linkedin.com/company/targlabs/?viewAsMember=true" target="_blank" rel="noopener noreferrer">
          Powered by TargLabs <FiArrowUpRight aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
};

export default Home;
