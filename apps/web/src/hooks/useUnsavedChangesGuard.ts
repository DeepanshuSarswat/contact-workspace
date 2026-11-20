import { useEffect } from 'react';
import { useBlocker } from 'react-router';

// In-app navigation is blocked so the caller can ask; tab close/reload gets the browser prompt.
// Query-string-only changes on the same page are allowed.
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ''; // required by some browsers to show the prompt
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);

  return blocker;
}
