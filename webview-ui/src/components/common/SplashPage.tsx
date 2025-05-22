import React from 'react';
import { useExtensionState } from '../../context/ExtensionStateContext';

const SplashPage: React.FC = () => {
  const { rootaskerLiteSvgUri, rootaskerDarkSvgUri } = useExtensionState();

  // URIs for SVGs provided by the extension backend
  const iconForDarkTheme = rootaskerDarkSvgUri; // Dark icon for dark backgrounds
  const iconForLightTheme = rootaskerLiteSvgUri; // Lite icon for light backgrounds

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        textAlign: 'center',
        fontFamily: 'sans-serif',
      }}
    >
      {iconForDarkTheme && iconForLightTheme && (
        <picture>
          <source
            srcSet={iconForDarkTheme}
            media="(prefers-color-scheme: dark)"
          />
          <source
            srcSet={iconForLightTheme}
            media="(prefers-color-scheme: light)"
          />
          <img
            src={iconForLightTheme} // Default to the icon for light themes
            alt="RooTasker Logo"
            style={{ width: '150px', marginBottom: '20px' }}
          />
        </picture>
      )}
      <h1 style={{ fontSize: '2em', margin: '0.5em 0' }}>Welcome to RooTasker!</h1>
      <p style={{ fontSize: '1.2em', color: '#555' }}>
        Your advanced task automation assistant.
      </p>
      <p style={{ marginTop: '2em', fontSize: '0.9em', color: '#777' }}>
        Loading your workspace...
      </p>
    </div>
  );
};

export default SplashPage;
