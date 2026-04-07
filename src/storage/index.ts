import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export const PRIVATE_DIR_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

function isMissingError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT');
}

export function ensurePrivateDirectory(dirPath: string): void {
  try {
    const stats = fs.lstatSync(dirPath);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`Refusing to use non-directory path: ${dirPath}`);
    }
  } catch (error) {
    if (!isMissingError(error)) {
      throw error;
    }

    fs.mkdirSync(dirPath, { recursive: true, mode: PRIVATE_DIR_MODE });
  }

  fs.chmodSync(dirPath, PRIVATE_DIR_MODE);
}

export function readTextFileSafe(filePath: string, maxBytes: number): string {
  const stats = fs.lstatSync(filePath);

  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Refusing to read non-regular file: ${filePath}`);
  }

  if (stats.size > maxBytes) {
    throw new Error(`Refusing to read oversized file: ${filePath}`);
  }

  return fs.readFileSync(filePath, 'utf-8');
}

export function writeTextFileAtomic(filePath: string, content: string): void {
  const dirPath = path.dirname(filePath);
  ensurePrivateDirectory(dirPath);

  try {
    const existingStats = fs.lstatSync(filePath);
    if (existingStats.isSymbolicLink() || (!existingStats.isFile() && !existingStats.isDirectory())) {
      throw new Error(`Refusing to overwrite non-regular file: ${filePath}`);
    }
  } catch (error) {
    if (!isMissingError(error)) {
      throw error;
    }
  }

  const tempPath = path.join(
    dirPath,
    `.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`,
  );

  try {
    fs.writeFileSync(tempPath, content, { encoding: 'utf-8', mode: PRIVATE_FILE_MODE, flag: 'wx' });
    fs.chmodSync(tempPath, PRIVATE_FILE_MODE);
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, PRIVATE_FILE_MODE);
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {}
    throw error;
  }
}

export function removeFileIfExists(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true });
  } catch (error) {
    if (!isMissingError(error)) {
      throw error;
    }
  }
}

export function pathExists(filePath: string): boolean {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}
