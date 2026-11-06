import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageDownloadResult {
  filePath?: string;
  downloadUrl?: string;
  buffer?: Buffer;
  mimeType?: string;
}

export interface IStorageProvider {
  uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<{ storagePath: string }>;
  getDownloadTarget(key: string, fileName: string): Promise<StorageDownloadResult>;
  deleteFile(key: string): Promise<void>;
  deleteFiles(keys: string[]): Promise<void>;
  fileExists(key: string): Promise<boolean>;
}

export class LocalStorageProvider implements IStorageProvider {
  private uploadsDir: string;

  constructor(customUploadsDir?: string) {
    this.uploadsDir = customUploadsDir || path.resolve(process.cwd(), 'uploads');
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.uploadsDir)) {
      await fs.mkdir(this.uploadsDir, { recursive: true });
    }
  }

  private resolveSafePath(key: string): string {
    const safeKey = path.basename(key);
    const resolved = path.resolve(this.uploadsDir, safeKey);
    if (!resolved.startsWith(this.uploadsDir)) {
      throw new Error('Invalid file path traversal attempt');
    }
    return resolved;
  }

  async uploadFile(key: string, buffer: Buffer): Promise<{ storagePath: string }> {
    await this.ensureDir();
    const targetPath = this.resolveSafePath(key);
    await fs.writeFile(targetPath, buffer);
    return { storagePath: path.basename(targetPath) };
  }

  async getDownloadTarget(key: string, _fileName: string): Promise<StorageDownloadResult> {
    const targetPath = this.resolveSafePath(key);
    if (!existsSync(targetPath)) {
      throw new Error('File data does not exist on storage');
    }
    return { filePath: targetPath };
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const targetPath = this.resolveSafePath(key);
      if (existsSync(targetPath)) {
        await fs.unlink(targetPath);
      }
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async deleteFiles(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.deleteFile(k)));
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const targetPath = this.resolveSafePath(key);
      return existsSync(targetPath);
    } catch {
      return false;
    }
  }
}

export interface S3Config {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  presignedExpirySeconds?: number;
}

export class S3StorageProvider implements IStorageProvider {
  private client: S3Client;
  private bucket: string;
  private presignedExpirySeconds: number;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.presignedExpirySeconds = config.presignedExpirySeconds || 300; // 5 min default

    this.client = new S3Client({
      region: config.region || (config.endpoint?.includes('r2.cloudflarestorage.com') ? 'auto' : 'us-east-1'),
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? (!!config.endpoint),
    });
  }

  async uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<{ storagePath: string }> {
    const sanitizedKey = path.basename(key);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: sanitizedKey,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: 'AES256',
    });

    await this.client.send(command);
    return { storagePath: sanitizedKey };
  }

  async getDownloadTarget(key: string, fileName: string): Promise<StorageDownloadResult> {
    const sanitizedKey = path.basename(key);
    const safeDispositionName = fileName.replace(/["\r\n]/g, '_');

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: sanitizedKey,
      ResponseContentDisposition: `attachment; filename="${safeDispositionName}"`,
    });

    const downloadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.presignedExpirySeconds,
    });

    return { downloadUrl };
  }

  async deleteFile(key: string): Promise<void> {
    const sanitizedKey = path.basename(key);
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: sanitizedKey,
    });

    try {
      await this.client.send(command);
    } catch {
      // Ignore if not found on S3
    }
  }

  async deleteFiles(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const sanitizedKeys = keys.map((k) => ({ Key: path.basename(k) }));

    const command = new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: {
        Objects: sanitizedKeys,
        Quiet: true,
      },
    });

    try {
      await this.client.send(command);
    } catch {
      // Fallback to individual deletions
      await Promise.all(keys.map((k) => this.deleteFile(k)));
    }
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const sanitizedKey = path.basename(key);
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: sanitizedKey,
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Storage service factory that initializes provider based on environment configuration.
 */
function createStorageProvider(): IStorageProvider {
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

  if ((driver === 's3' || driver === 'r2') && process.env.S3_BUCKET) {
    return new S3StorageProvider({
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      presignedExpirySeconds: process.env.S3_PRESIGNED_EXPIRY_SECONDS
        ? parseInt(process.env.S3_PRESIGNED_EXPIRY_SECONDS, 10)
        : 300,
    });
  }

  return new LocalStorageProvider();
}

export const storageService = createStorageProvider();
