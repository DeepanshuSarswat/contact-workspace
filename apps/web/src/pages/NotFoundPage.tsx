import { Link } from 'react-router';
import { EmptyState } from '../components/States';
import { pageTitle } from '../lib/format';

export function NotFoundPage() {
  return (
    <div className="card">
      <title>{pageTitle('Page not found')}</title>
      <EmptyState title="Page not found" description="There's nothing at this address.">
        <Link to="/contacts">Back to contacts</Link>
      </EmptyState>
    </div>
  );
}
