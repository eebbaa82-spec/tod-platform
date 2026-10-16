process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://tod:tod@localhost:5432/tod_test';
process.env.APP_ENV = 'test';
process.env.JOBS_DISABLED = 'true';
process.env.FILE_STORAGE_DIR = './storage-test';
