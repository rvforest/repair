import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { AnalysisResponse, CacheEntry } from '../types';

export class CacheManager {
  private cacheDir: string;
  private ttl: number;

  constructor(ttl: number = 24 * 60 * 60 * 1000) {
    const cacheBase = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
    this.cacheDir = path.join(cacheBase, 'repair');
    this.ttl = ttl;

    // Create cache directory if it doesn't exist
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getCacheKey(command: string, output: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(command + '\n' + output);
    return hash.digest('hex');
  }

  private getCachePath(key: string): string {
    return path.join(this.cacheDir, `${key}.json`);
  }

  async get(command: string, output: string): Promise<AnalysisResponse | null> {
    const key = this.getCacheKey(command, output);
    const cachePath = this.getCachePath(key);

    if (!fs.existsSync(cachePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(cachePath, 'utf-8');
      const entry: CacheEntry = JSON.parse(content);

      // Check if cache is expired
      const now = Date.now();
      if (now - entry.timestamp > this.ttl) {
        // Clean up expired cache
        fs.unlinkSync(cachePath);
        return null;
      }

      return entry.response;
    } catch (error) {
      // If cache is corrupted, delete it
      try {
        fs.unlinkSync(cachePath);
      } catch {}
      return null;
    }
  }

  async set(command: string, output: string, response: AnalysisResponse): Promise<void> {
    const key = this.getCacheKey(command, output);
    const cachePath = this.getCachePath(key);

    const entry: CacheEntry = {
      response,
      timestamp: Date.now(),
    };

    try {
      fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2), 'utf-8');
    } catch (error) {
      // Silently fail if we can't write cache
      console.warn('Warning: Could not write to cache');
    }
  }

  async clear(): Promise<void> {
    if (!fs.existsSync(this.cacheDir)) {
      return;
    }

    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    } catch (error) {
      console.warn('Warning: Could not clear cache');
    }
  }

  async cleanExpired(): Promise<void> {
    if (!fs.existsSync(this.cacheDir)) {
      return;
    }

    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const entry: CacheEntry = JSON.parse(content);

          if (now - entry.timestamp > this.ttl) {
            fs.unlinkSync(filePath);
          }
        } catch {
          // If we can't read/parse it, delete it
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      // Silently fail
    }
  }
}
