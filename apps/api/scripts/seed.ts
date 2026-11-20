// Wipes and reseeds the dev database. SEED_COUNT=1000000 npm run db:seed for a bigger set.
// Fixed faker seed, so everyone gets the same data.
import { faker } from '@faker-js/faker';
import { createPool, withTransaction } from '../src/db/pool';
import { runMigrations } from '../src/db/migrate';

const COUNT = Number(process.env.SEED_COUNT ?? 50_000);
const BATCH = 5_000;
const TAGS = ['Lead', 'Customer', 'VIP', 'Prospect', 'Partner', 'Newsletter', 'Churned'];
const TAG_WEIGHTS = [0.3, 0.25, 0.05, 0.2, 0.08, 0.15, 0.06];
const DAY_MS = 86_400_000;

if (!Number.isInteger(COUNT) || COUNT < 0) throw new Error('SEED_COUNT must be an integer >= 0');

faker.seed(42);
const NOW = Date.parse('2026-11-15T12:00:00Z');
const COMPANIES = faker.helpers.uniqueArray(() => faker.company.name(), 300);

// known rows for manual testing
const KNOWN = [
  {
    first: 'Ravi',
    last: 'Kumar',
    email: 'ravi.kumar@example.com',
    phone: '+91 98765 43210',
    company: 'HighLevel',
    tags: ['VIP', 'Customer'],
  },
  {
    first: 'Priya',
    last: 'Sharma',
    email: 'priya.sharma@example.com',
    phone: '+91 91234 56789',
    company: 'HighLevel',
    tags: ['Lead'],
  },
  {
    first: 'John',
    last: 'Smith',
    email: 'john.smith@example.com',
    phone: '+1 (555) 010-2030',
    company: 'Acme Corp',
    tags: ['Prospect'],
  },
  {
    first: 'Ada',
    last: 'Lovelace',
    email: null,
    phone: '+44 20 7946 0958',
    company: null,
    tags: [],
  },
  {
    first: 'Grace',
    last: 'Hopper',
    email: 'grace@example.com',
    phone: null,
    company: 'Acme Corp',
    tags: ['VIP', 'Partner'],
  },
];

interface Row {
  first: string;
  last: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
}

function makeRow(i: number): Row {
  const first = faker.person.firstName();
  const last = faker.person.lastName();
  // index suffix keeps emails unique
  const email = faker.datatype.boolean(0.9)
    ? `${first}.${last}.${i}@${faker.internet.domainName()}`
        .toLowerCase()
        .replace(/[^a-z0-9.@-]/g, '')
    : null;
  const phone = faker.datatype.boolean(0.85)
    ? faker.phone.number({ style: 'international' })
    : null;
  const company = faker.datatype.boolean(0.8) ? faker.helpers.arrayElement(COMPANIES) : null;
  const createdAt = new Date(
    NOW - faker.number.int({ min: 0, max: 3 * 365 }) * DAY_MS - faker.number.int(DAY_MS),
  );
  const updatedAt = new Date(
    Math.min(NOW, createdAt.getTime() + faker.number.int({ min: 0, max: 200 }) * DAY_MS),
  );
  const tags = TAGS.filter((_, t) => faker.datatype.boolean(TAG_WEIGHTS[t]!)).slice(0, 3);
  return { first, last, email, phone, company, createdAt, updatedAt, tags };
}

function knownRow(k: (typeof KNOWN)[number], i: number): Row {
  const createdAt = new Date(NOW - i * DAY_MS);
  return { ...k, createdAt, updatedAt: createdAt };
}

const pool = createPool();
const started = Date.now();

try {
  await runMigrations(pool);

  await withTransaction(pool, async (db) => {
    await db.query(
      'TRUNCATE contact_activity, contact_tags, contacts, tags RESTART IDENTITY CASCADE',
    );

    const { rows: tagRows } = await db.query<{ id: number; name: string }>(
      'INSERT INTO tags (name) SELECT unnest($1::text[]) RETURNING id, name',
      [TAGS],
    );
    const tagId = new Map(tagRows.map((t) => [t.name, t.id]));

    const total = KNOWN.length + COUNT;
    for (let offset = 0; offset < total; offset += BATCH) {
      const rows: Row[] = [];
      for (let i = offset; i < Math.min(offset + BATCH, total); i++) {
        rows.push(i < KNOWN.length ? knownRow(KNOWN[i]!, i) : makeRow(i));
      }

      const { rows: inserted } = await db.query<{ id: number }>(
        `INSERT INTO contacts (first_name, last_name, email, phone, company, created_at, updated_at)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                              $6::timestamptz[], $7::timestamptz[])
         RETURNING id`,
        [
          rows.map((r) => r.first),
          rows.map((r) => r.last),
          rows.map((r) => r.email),
          rows.map((r) => r.phone),
          rows.map((r) => r.company),
          rows.map((r) => r.createdAt),
          rows.map((r) => r.updatedAt),
        ],
      );

      // unnest keeps input order, so inserted[i] matches rows[i]
      const contactIds: number[] = [];
      const tagIds: number[] = [];
      rows.forEach((r, idx) => {
        for (const t of r.tags) {
          contactIds.push(inserted[idx]!.id);
          tagIds.push(tagId.get(t)!);
        }
      });
      if (contactIds.length) {
        await db.query(
          'INSERT INTO contact_tags (contact_id, tag_id) SELECT * FROM unnest($1::bigint[], $2::bigint[])',
          [contactIds, tagIds],
        );
      }
      process.stdout.write(`\r[seed] ${Math.min(offset + BATCH, total)}/${total} contacts`);
    }
  });

  await pool.query('ANALYZE contacts, contact_tags, tags');
  console.log(`\n[seed] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
} catch (err) {
  console.error('\n[seed] failed:', (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
