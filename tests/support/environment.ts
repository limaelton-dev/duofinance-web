import { resolve } from 'node:path';

export const apiDirectory =
    process.env.E2E_API_DIR ?? resolve(__dirname, '../../../duofinance-api');
export const testDatabaseUrl =
    process.env.E2E_DATABASE_URL ??
    'postgresql://test:test@127.0.0.1:55432/duofinance_test';

const database = new URL(testDatabaseUrl);
if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !['127.0.0.1', 'localhost'].includes(database.hostname) ||
    database.pathname !== '/duofinance_test'
) {
    throw new Error('A integração exige o banco local duofinance_test.');
}
