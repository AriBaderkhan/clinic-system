// Sentry must be initialised before anything else loads, so this file is
// imported as the VERY FIRST line of main.js. It only activates when a DSN is
// present and we're not running tests — so dev/test stay completely untouched.
import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';
dotenv.config();

if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        // We only report crashes, not performance traces — keeps us on the free tier.
        tracesSampleRate: 0,
    });
}

export default Sentry;
