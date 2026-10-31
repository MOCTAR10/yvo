'use strict';

/* ============================================================
   YVO Épargne — accès PostgreSQL partagé (serveur + outils CLI)
   ============================================================ */

const crypto = require('node:crypto');
const { Pool, types } = require('pg');

// BIGINT (seq, u, COUNT) → nombre JS : les valeurs restent bien sous 2^53
types.setTypeParser(20, function (v) { return Number(v); });

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://yvo:yvo@localhost:5442/yvo';
const ACCOUNT_NAME = 'yvo';

/* Tables créées de façon idempotente au démarrage.
   - records.data reste en TEXT : la détection « inchangé » compare la chaîne JSON exacte.
   - events.seq (BIGSERIAL) : journal d'audit immuable, sert aussi de curseur de synchronisation. */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    device_id TEXT,
    device_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS events (
    seq BIGSERIAL PRIMARY KEY,
    account_id TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    device_id TEXT,
    device_name TEXT,
    kind TEXT NOT NULL,
    rec_id TEXT NOT NULL,
    op TEXT NOT NULL,
    data TEXT,
    note TEXT
  );
  CREATE INDEX IF NOT EXISTS events_rec ON events (account_id, kind, rec_id);
  CREATE TABLE IF NOT EXISTS records (
    account_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT false,
    rev INTEGER NOT NULL,
    u BIGINT NOT NULL,
    seq BIGINT NOT NULL,
    PRIMARY KEY (account_id, kind, id)
  );
  CREATE INDEX IF NOT EXISTS records_seq ON records (account_id, seq);
  CREATE TABLE IF NOT EXISTS public_receipts (
    token TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    rec_id TEXT NOT NULL
  );
`;

const TABLES = ['public_receipts', 'records', 'events', 'sessions', 'accounts'];

function createPool() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
  pool.on('error', function (err) { console.error('PostgreSQL : erreur de connexion inactive', err.message); });
  return pool;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

async function ensureSchema(pool) {
  // verrou pour que deux démarrages simultanés ne se gênent pas
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(hashtext('yvo-schema'))");
    await c.query(SCHEMA);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(function () {});
    throw e;
  } finally {
    c.release();
  }
}

/* Crée ou remplace le mot de passe du compte unique « yvo ». */
async function setPassword(pool, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const r = await pool.query(
    'INSERT INTO accounts (id, name, salt, hash) VALUES ($1, $2, $3, $4) ' +
    'ON CONFLICT (name) DO UPDATE SET salt = EXCLUDED.salt, hash = EXCLUDED.hash RETURNING id',
    [crypto.randomUUID(), ACCOUNT_NAME, salt, hash]);
  return r.rows[0].id;
}

module.exports = { DATABASE_URL, ACCOUNT_NAME, SCHEMA, TABLES, createPool, hashPassword, ensureSchema, setPassword };
