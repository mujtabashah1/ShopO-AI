/**
 * Home Page
 * ---------
 * Landing page with a hero section, search bar, platform selection,
 * and feature highlights. Users can search for products from here.
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiCpu, FiBarChart2, FiShield, FiCamera, FiUploadCloud, FiX } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import api from '../services/api';
import './Home.css';

// Feature cards shown below the search bar
const features = [
  {
    icon: FiCpu,
    title: 'AI Analysis',
    description: 'Advanced fake product detection using price comparison, seller ratings, and review analysis.'
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
          <h1 className="hero-title">
            Smart Shopping with
            <span className="hero-highlight"> AI Protection</span>
          </h1>
          <p className="hero-subtitle">
            Detect fake products, analyze reviews, and make informed 
            purchasing decisions across AliExpress, eBay, Amazon, and Daraz.
          </p>

          {/* Search Form */}
          <form className="search-form" onSubmit={handleSearch}>
            <div className="search-input-wrapper">
              <FiSearch className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search for a product... (e.g., iPhone 15, Samsung Galaxy S24)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="search-btn" disabled={imageSearching}>
                {imageSearching ? 'Identifying...' : 'Search'}
              </button>
            </div>

            {/* Platform Selection */}
            <div className="platform-selection">
              {Object.entries(platforms).map(([name, active]) => (
                <label key={name} className={`platform-chip ${active ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => togglePlatform(name)}
                    style={{ display: 'none' }}
                  />
                  <span className="chip-name">
                    {name.charAt(0).toUpperCase() + name.slice(1)}
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
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <h2 className="section-title">How It Works</h2>
        <div className="features-grid">
          {features.map((feature, index) => (
            <div key={index} className="feature-card">
              <div className="feature-icon-wrapper">
                <feature.icon size={28} />
              </div>
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
    </div>
  );
};

export default Home;
