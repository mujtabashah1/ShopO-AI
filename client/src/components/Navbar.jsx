/**
 * Navbar Component
 * ----------------
 * Top navigation bar shown on every page.
 * Displays app logo, navigation links, and auth controls.
 * Responsive: collapses into a hamburger menu on mobile.
 */

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiShoppingBag,
  FiMenu,
  FiX,
  FiLogOut,
  FiClock,
  FiUser,
  FiShield,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import ExtensionStatus from "./ExtensionStatus";
import "./Navbar.css";

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // Handle logout: clear state and redirect to home
  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate("/");
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Logo / Brand */}
        <Link
          to="/"
          className="navbar-brand"
          onClick={() => setMenuOpen(false)}
        >
          <FiShoppingBag className="brand-icon" />
          <span className="brand-text">ShopO-AI</span>
        </Link>

        {/* Hamburger button (mobile) */}
        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <FiX size={24} /> : <FiMenu size={24} />}
        </button>

        {/* Navigation links */}
        <div className={`navbar-links ${menuOpen ? "active" : ""}`}>
          <Link to="/" className="nav-link" onClick={() => setMenuOpen(false)}>
            Home
          </Link>

          {isAuthenticated ? (
            <>
              <Link
                to="/verify"
                className="nav-link"
                onClick={() => setMenuOpen(false)}
              >
                <FiShield /> Verify
              </Link>
              <Link
                to="/history"
                className="nav-link"
                onClick={() => setMenuOpen(false)}
              >
                <FiClock /> History
              </Link>
              <ExtensionStatus />
              <div className="nav-user">
                <FiUser className="user-icon" />
                <span className="user-name">{user?.name}</span>
              </div>
              <button className="nav-btn logout-btn" onClick={handleLogout}>
                <FiLogOut /> Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="nav-link"
                onClick={() => setMenuOpen(false)}
              >
                Login
              </Link>
              <Link
                to="/register"
                className="nav-btn register-btn"
                onClick={() => setMenuOpen(false)}
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
