/**
 * Extension Status Indicator
 * --------------------------
 * Shows a small badge in the Navbar indicating whether
 * the Chrome extension is connected.
 */

import React from 'react';
import { useExtension } from '../context/ExtensionContext';

const ExtensionStatus = () => {
  const { isExtensionConnected } = useExtension();

  return (
    <div
      className="extension-status"
      title={isExtensionConnected ? 'Chrome Extension Connected' : 'Extension Not Connected'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        background: isExtensionConnected ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.1)',
        color: isExtensionConnected ? '#2ecc71' : '#999',
        marginRight: '8px'
      }}
    >
      <span style={{
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: isExtensionConnected ? '#2ecc71' : '#ccc',
        boxShadow: isExtensionConnected ? '0 0 6px rgba(46,204,113,0.5)' : 'none'
      }} />
      {isExtensionConnected ? 'Ext' : 'No Ext'}
    </div>
  );
};

export default ExtensionStatus;
