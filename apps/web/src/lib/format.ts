const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

export const fullName = (c: { firstName: string; lastName: string }) =>
  `${c.firstName} ${c.lastName}`.trim();

export const pageTitle = (page: string) => `${page} · Contacts Workspace`;
