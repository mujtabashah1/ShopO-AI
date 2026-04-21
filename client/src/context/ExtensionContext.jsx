/**
 * Extension Context
 * -----------------
 * Tracks whether the Chrome extension is connected.
 * Polls the server every 10 seconds for extension status.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const ExtensionContext = createContext();

export const ExtensionProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [extensionStatus, setExtensionStatus] = useState({
    connected: false,
    extensionId: null,
    pendingTasks: 0
  });

  const checkStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setExtensionStatus({ connected: false, extensionId: null, pendingTasks: 0 });
      return;
    }
    try {
      const { data } = await api.get('/extension/status');
      setExtensionStatus(data);
    } catch (err) {
      setExtensionStatus({ connected: false, extensionId: null, pendingTasks: 0 });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return (
    <ExtensionContext.Provider value={{
      isExtensionConnected: extensionStatus.connected,
      extensionStatus,
      refreshStatus: checkStatus
    }}>
      {children}
    </ExtensionContext.Provider>
  );
};

export const useExtension = () => {
  const context = useContext(ExtensionContext);
  if (!context) {
    throw new Error('useExtension must be used within ExtensionProvider');
  }
  return context;
};
