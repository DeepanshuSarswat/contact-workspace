import { Link, Outlet } from 'react-router';
import { ErrorBoundary } from './ErrorBoundary';
import { IconUsers } from './Icons';
import { OfflineBanner } from './OfflineBanner';
import { ThemeToggle } from './ThemeToggle';

export function Layout() {
  return (
    <div className="app">
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          // focus main without adding #main to the URL
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/contacts" className="brand">
            <span className="brand-mark">
              <IconUsers size={16} />
            </span>
            Contacts Workspace
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <OfflineBanner />
      <main id="main" className="app-main" tabIndex={-1}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
