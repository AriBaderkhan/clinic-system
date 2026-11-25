// Safety lock for tests and the test seed.
// Runs BEFORE the app is imported, so db_connection.js picks the TEST database.
// Refuses to continue unless the database is on this computer and its name ends with "_test".
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

process.env.NODE_ENV = 'test';
process.env.DB_NAME_TEST = process.env.DB_NAME_TEST || 'backup_db_bakur_test';

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

if (process.env.DATABASE_URL) {
    throw new Error('STOP: DATABASE_URL is set. Tests never run against a remote database.');
}
if (!LOCAL_HOSTS.includes(process.env.DB_HOST)) {
    throw new Error(`STOP: DB_HOST is "${process.env.DB_HOST}", not localhost.`);
}
if (!process.env.DB_NAME_TEST.endsWith('_test')) {
    throw new Error(`STOP: test database "${process.env.DB_NAME_TEST}" must end with "_test".`);
}
