import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

let pool;

if (process.env.DATABASE_URL) {
    // Production (Render / Supabase)
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
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
    });
}
pool.connect()
    .then(() => console.log("connected"))
    .catch(err => console.log(err.stack))

export default pool;