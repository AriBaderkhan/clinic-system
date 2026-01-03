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
    // Local development
    pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
}
pool.connect()
    .then(() => console.log("connected"))
    .catch(err => console.log(err.stack))

export default pool;