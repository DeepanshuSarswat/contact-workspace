// Builds $1, $2... placeholders for dynamic SQL so values are never concatenated in.
export class SqlParams {
  readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

// so "50%" or "a_b" are matched literally
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
