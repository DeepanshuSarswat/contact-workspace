import { lazy, Suspense } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { Layout } from './components/Layout';
import { Loading } from './components/States';
import { ContactsPage } from './pages/ContactsPage';
import { NotFoundPage } from './pages/NotFoundPage';

// loaded only when a contact is opened
const ContactDetailPage = lazy(() =>
  import('./pages/ContactDetailPage').then((m) => ({ default: m.ContactDetailPage })),
);

// a data router is needed for useBlocker
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/contacts" replace /> },
      { path: 'contacts', element: <ContactsPage /> },
      {
        path: 'contacts/:id',
        element: (
          <Suspense fallback={<Loading label="Loading contact…" rows={4} />}>
            <ContactDetailPage />
          </Suspense>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
