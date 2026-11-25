import { defineConfig } from 'vitest/config';

export default defineConfig({
    // Windows note: run from a path with a capital drive letter ("C:\..."). A terminal opened as "c:\..."
    // makes Vitest load itself twice and fail with "failed to find the current suite".
    test: {
        // the safety lock runs before every test file (picks the local _test database)
        setupFiles: ['./tests/setup/testDb.js'],
        // test files share one database: run them one after another, never at the same time
        fileParallelism: false,
        testTimeout: 30000,
        hookTimeout: 120000,
    },
});
