// Runtime configuration read once from the environment.
function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  get env() {
    return process.env.APP_ENV ?? 'development';
  },
  get isProduction() {
    return this.env === 'production';
  },
  // Test stand-ins for the developer-owned modules are only reachable outside production.
  get standInsEnabled() {
    return this.env !== 'production';
  },
  get port() {
    return Number(process.env.PORT ?? 4000);
  },
  get jwtSecret() {
    return required('JWT_SECRET', this.isProduction ? undefined : 'dev-secret');
  },
  get fieldKey() {
    return required(
      'FIELD_ENCRYPTION_KEY',
      this.isProduction ? undefined : '0'.repeat(64),
    );
  },
  get fileDir() {
    return process.env.FILE_STORAGE_DIR ?? './storage';
  },
  get smsProvider() {
    return process.env.SMS_PROVIDER ?? 'console';
  },
  get webOrigin() {
    return process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  },
};
