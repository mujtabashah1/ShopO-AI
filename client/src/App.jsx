/**
 * App Component (Root)
 * --------------------
 * Sets up React Router and wraps the app with AuthProvider.
 * Defines all routes and their corresponding page components.
 * 
 * Routes:
 *   /           → Home (search page)
 *   /login      → Login page
 *   /register   → Registration page
 *   /results    → Search results grid
 *   /product    → Product AI analysis page
 *   /history    → Past analysis history
 *   /verify     → Product image verification
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Context
import { AuthProvider } from './context/AuthContext';
import { ExtensionProvider } from './context/ExtensionContext';

// Components
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Results from './pages/Results';
import ProductDetail from './pages/ProductDetail';
import History from './pages/History';
import VerifyProduct from './pages/VerifyProduct';

function App() {
  return (
    <AuthProvider>
      <ExtensionProvider>
      <Router>
        {/* Navigation bar — shown on every page */}
        <Navbar />

        {/* Page content */}
        <main>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected routes (require login) */}
            <Route path="/results" element={
              <ProtectedRoute><Results /></ProtectedRoute>
            } />
            <Route path="/product" element={
              <ProtectedRoute><ProductDetail /></ProtectedRoute>
            } />
            <Route path="/history" element={
              <ProtectedRoute><History /></ProtectedRoute>
            } />
            <Route path="/verify" element={
              <ProtectedRoute><VerifyProduct /></ProtectedRoute>
            } />
          </Routes>
        </main>

        {/* Toast notifications container */}
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
        />
      </Router>
      </ExtensionProvider>
    </AuthProvider>
  );
}

export default App;
