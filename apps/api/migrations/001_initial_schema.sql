
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE contacts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name    text        NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 100),
  last_name     text        NOT NULL DEFAULT '' CHECK (char_length(last_name) <= 100),
  email         text        NULL CHECK (email = lower(email) AND char_length(email) <= 254),
  phone         text        NULL CHECK (char_length(phone) <= 30),
  company       text        NULL CHECK (char_length(company) <= 200),
  version       integer     NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- "Ravi Kumar": what users search and sort by.
  full_name     text GENERATED ALWAYS AS (btrim(first_name || ' ' || last_name)) STORED,
  -- Case-insensitive sort key for "sort by name".
  sort_name     text GENERATED ALWAYS AS (lower(btrim(first_name || ' ' || last_name))) STORED,
  -- "+1 (555) 010-2030" -> "15550102030" so phone search ignores formatting.
  phone_digits  text GENERATED ALWAYS AS (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) STORED
);

-- unique when present; emails are stored lower-case
CREATE UNIQUE INDEX contacts_email_key ON contacts (email) WHERE email IS NOT NULL;

-- keyset pagination (sort column + id); works for ASC and DESC
CREATE INDEX contacts_sort_name_id_idx  ON contacts (sort_name, id);
CREATE INDEX contacts_created_at_id_idx ON contacts (created_at, id);

-- substring search
CREATE INDEX contacts_full_name_trgm_idx    ON contacts USING gin (full_name gin_trgm_ops);
CREATE INDEX contacts_email_trgm_idx        ON contacts USING gin (email gin_trgm_ops);
CREATE INDEX contacts_phone_digits_trgm_idx ON contacts USING gin (phone_digits gin_trgm_ops);

CREATE INDEX contacts_company_lower_idx ON contacts (lower(company));


CREATE TABLE tags (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tags_name_lower_key ON tags (lower(name));


CREATE TABLE contact_tags (
  contact_id  bigint      NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  tag_id      bigint      NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id)          -- a tag can be on a contact only once
);

-- tag filter
CREATE INDEX contact_tags_tag_id_contact_id_idx ON contact_tags (tag_id, contact_id);


CREATE TABLE contact_activity (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id  bigint      NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  type        text        NOT NULL CHECK (type IN ('CONTACT_UPDATED', 'TAG_ADDED', 'TAG_REMOVED')),
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_activity_contact_recent_idx
  ON contact_activity (contact_id, created_at DESC, id DESC);
