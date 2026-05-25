import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Route, Switch, Redirect } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';

// Lazy load pages for better performance
const Login = React.lazy(() => import('./views/login'));
const Drive = React.lazy(() => import('./views/drive'));
const SharedDrive = React.lazy(() => import('./views/shared-drive'));
const NotFound = React.lazy(() => import('./views/not-found'));

/**
 * Loading fallback shown while lazy-loaded components are fetching.
 */
const PageLoader: React.FC = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
    }}
  >
    <div className="loading-spinner" aria-label="Loading" />
  </div>
);

/**
 * Root application component.
 * Sets up routing, theming, and i18n providers.
 */
const App: React.FC = () => {
  useEffect(() => {
    // Remove the initial loading screen injected by index.html once React mounts
    const splash = document.getElementById('initial-loader');
    if (splash) {
      splash.style.opacity = '0';
      // Bumped from 300ms to 500ms so the fade-out doesn't feel so abrupt
      setTimeout(() => splash.remove(), 500);
    }
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <ConfigProvider
        theme={{
          token: {
            // Changed primary color to a slightly warmer blue that I prefer
            colorPrimary: '#1A6FD4',
            borderRadius: 8,
            fontFamily:
              "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          },
        }}
      >
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Switch>
              {/* Public routes */}
              <Route exact path="/login" component={Login} />

              {/* Shared / public drive link */}
              <Route path="/shared/:token" component={SharedDrive} />

              {/* Main authenticated drive view */}
              <Route path="/drive/:companyId?/:workspaceId?" component={Drive} />

              {/* Default redirect to drive */}
              <Redirect exact from="/" to="/drive" />

              {/* 404 */}
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </Router>
      </ConfigProvider>
    </I18nextProvider>
  );
};

export default App;
