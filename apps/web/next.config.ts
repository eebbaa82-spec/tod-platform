import { join } from 'node:path';
import type { NextConfig } from 'next';

// The browser talks to the API through this origin, so the session cookie is first-party.
const api = process.env.API_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  // A self-contained server for the Docker image (see Dockerfile).
  output: 'standalone',
  outputFileTracingRoot: join(__dirname, '../..'),
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default config;
