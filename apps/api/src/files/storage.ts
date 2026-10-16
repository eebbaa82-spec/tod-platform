import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { config } from '../common/config';

// Storage adapter. Local disk for development; swap for an S3-compatible store
// (for example MinIO on Ethiopian servers) in production (NFR-PRV-02).
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export class LocalDiskStorage implements FileStorage {
  private root = resolve(config.fileDir);
  private path(key: string) {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root)) throw new Error('Invalid storage key');
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await fs.mkdir(resolve(p, '..'), { recursive: true });
    await fs.writeFile(p, data);
  }
  async get(key: string) {
    return fs.readFile(this.path(key));
  }
}

// Malware scanning (NFR-SEC-04). Connect ClamAV (clamd) here before go-live.
export interface FileScanner {
  scan(data: Buffer): Promise<'CLEAN' | 'INFECTED' | 'SKIPPED'>;
}

export class NoScanner implements FileScanner {
  async scan() {
    return 'SKIPPED' as const;
  }
}
