import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { IconAlert } from './Icons';

// TanStack Query pauses requests offline and resumes them on reconnect.
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <IconAlert />
      You’re offline. Showing the last loaded data; changes can’t be saved until you reconnect.
    </div>
  );
}
