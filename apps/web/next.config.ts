import { join } from 'node:path';
import type { NextConfig } from 'next';

// The browser talks to the API through this origin, so the session cookie is first-party.
const api = process.env.API_URL ?? 'http://localhost:4000';

// Optional sub-path the site is served under, e.g. "/tod" for eruditeafrica.com/tod.
// Fixed at build time; empty serves the site at the root of its domain.
const basePath = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
if (basePath && !/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(basePath)) {
  throw new Error(`BASE_PATH must look like /tod, got "${basePath}"`);
}

const config: NextConfig = {
  // A self-contained server for the Docker image (see Dockerfile).
  output: 'standalone',
  outputFileTracingRoot: join(__dirname, '../..'),
  basePath: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // With a basePath, this source is matched as <basePath>/api/... .
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default config;
