import { Link, useLocation, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { ActivityFeed } from '../components/contact/ActivityFeed';
import { ContactForm } from '../components/contact/ContactForm';
import { TagEditor } from '../components/contact/TagEditor';
import { Avatar } from '../components/Avatar';
import { CopyButton } from '../components/CopyButton';
import { IconArrowLeft, IconBuilding, IconMail, IconPhone } from '../components/Icons';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useContact } from '../hooks/useContact';
import { formatDateTime, fullName, pageTitle } from '../lib/format';

// the list passes its query string so Back keeps the filters
function useBackToList() {
  const state = useLocation().state as { listSearch?: string } | null;
  return `/contacts${state?.listSearch ?? ''}`;
}

export function ContactDetailPage() {
  const id = Number(useParams().id);
  const back = useBackToList();

  if (!Number.isSafeInteger(id) || id <= 0) return <NotFound back={back} />;
  return <ContactDetail id={id} back={back} />;
}

function ContactDetail({ id, back }: { id: number; back: string }) {
  const query = useContact(id);

  if (query.isPending) {
    return (
      <div className="card">
        <title>{pageTitle('Loading contact…')}</title>
        <Loading label="Loading contact…" rows={4} />
      </div>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.code === 'NOT_FOUND') {
      return <NotFound back={back} />;
    }
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const contact = query.data;
  return (
    <section>
      <title>{pageTitle(fullName(contact))}</title>
      <Link to={back} className="back-link">
        <IconArrowLeft /> Back to contacts
      </Link>

      <div className="card profile">
        <Avatar
          id={contact.id}
          firstName={contact.firstName}
          lastName={contact.lastName}
          size="lg"
        />
        <div>
          <h1>{fullName(contact)}</h1>
          <div className="profile-meta">
            {contact.company && (
              <span>
                <IconBuilding /> {contact.company}
              </span>
            )}
            {contact.email && (
              <span>
                <IconMail />
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
                <CopyButton value={contact.email} label="email" />
              </span>
            )}
            {contact.phone && (
              <span>
                <IconPhone />
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>{contact.phone}</a>
                <CopyButton value={contact.phone} label="phone number" />
              </span>
            )}
          </div>
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Created {formatDateTime(contact.createdAt)} · Last updated{' '}
            {formatDateTime(contact.updatedAt)}
          </p>
        </div>
      </div>

      <div className="detail-grid">
        {/* key: never show another contact's half-edited form */}
        <ContactForm key={contact.id} contact={contact} />
        <div className="detail-side">
          <TagEditor contact={contact} />
          <ActivityFeed contactId={contact.id} />
        </div>
      </div>
    </section>
  );
}

function NotFound({ back }: { back: string }) {
  return (
    <div className="card">
      <title>{pageTitle('Contact not found')}</title>
      <EmptyState
        title="Contact not found"
        description="It may have been removed, or the link is wrong."
      >
        <Link to={back}>Back to contacts</Link>
      </EmptyState>
    </div>
  );
}
