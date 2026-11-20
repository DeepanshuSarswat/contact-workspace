interface Props {
  id: number;
  firstName: string;
  lastName: string;
  size?: 'md' | 'lg';
}

export function initials(firstName: string, lastName: string): string {
  const letters = `${firstName.trim()[0] ?? ''}${lastName.trim()[0] ?? ''}`;
  return (letters || '?').toUpperCase();
}

// colour comes from the id so a contact always gets the same one
export function Avatar({ id, firstName, lastName, size = 'md' }: Props) {
  const hue = (id * 47) % 360;
  return (
    <span
      className={`avatar ${size === 'lg' ? 'avatar-lg' : ''}`}
      style={{ background: `hsl(${hue} 55% 46%)` }}
      aria-hidden="true"
    >
      {initials(firstName, lastName)}
    </span>
  );
}
