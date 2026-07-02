import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Pool sizing/timeouts. Defaults are conservative and safe for Supabase's
// pooler; override DB_POOL_MAX per environment if needed.
//  - max: cap concurrent connections so we never exhaust the DB/pooler.
//  - idleTimeoutMillis: drop idle clients so we don't hold connections open.
//  - connectionTimeoutMillis: fail fast instead of hanging if the DB is down.
const commonOptions = {
    max: Number(process.env.DB_POOL_MAX) || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
};

let pool;

if (process.env.DATABASE_URL) {
    // Production (Render / Supabase)
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        ...commonOptions,
    });
} else {
    // Local development. During tests (NODE_ENV=test) point at the throwaway
    // test database instead of the real dev one, so tests never touch real data.
    const database = process.env.NODE_ENV === 'test'
        ? (process.env.DB_NAME_TEST || 'clinic_system_test')
        : process.env.DB_NAME;
    pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database,
        ...commonOptions,
    });
}

// A dropped idle connection (common on Supabase/pgBouncer) emits an 'error' on
// the pool. Without this handler the unhandled error crashes the whole process.
// Log it and let the pool recycle the client on the next query.
pool.on('error', (err) => {
    console.error('Unexpected idle DB client error:', err.message);
});

// Startup connectivity check. Use pool.query (not pool.connect) so the client is
// returned to the pool automatically — pool.connect() would leak one client.
pool.query('SELECT 1')
    .then(() => console.log('DB connected'))
    .catch((err) => console.error('DB connection failed:', err.message));

export default pool;
