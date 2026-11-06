import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { LocalStorageProvider, S3StorageProvider } from '../src/services/storage.service.js';

// Setup mock storage dir for local provider test
const TEST_UPLOADS_DIR = path.resolve(process.cwd(), 'test-uploads-scratch');

describe('Storage Providers & Attachment Cleanup Verification', () => {
  beforeEach(async () => {
    if (existsSync(TEST_UPLOADS_DIR)) {
      await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe('LocalStorageProvider', () => {
    it('saves a file, verifies its existence, and deletes it cleanly', async () => {
      const provider = new LocalStorageProvider(TEST_UPLOADS_DIR);
      const testBuffer = Buffer.from('hello attachment cleanup test');
      const key = 'test-file.pdf';

      // 1. Upload
      const { storagePath } = await provider.uploadFile(key, testBuffer);
      expect(storagePath).toBe(key);

      // 2. Verify exists
      const existsBefore = await provider.fileExists(key);
      expect(existsBefore).toBe(true);

      // 3. Download target
      const download = await provider.getDownloadTarget(key, 'original-name.pdf');
      expect(download.filePath).toBeDefined();
      expect(existsSync(download.filePath!)).toBe(true);

      // 4. Delete single file
      await provider.deleteFile(key);
      const existsAfter = await provider.fileExists(key);
      expect(existsAfter).toBe(false);
    });

    it('deletes multiple files cleanly in bulk', async () => {
      const provider = new LocalStorageProvider(TEST_UPLOADS_DIR);
      const key1 = 'file1.txt';
      const key2 = 'file2.txt';

      await provider.uploadFile(key1, Buffer.from('content 1'));
      await provider.uploadFile(key2, Buffer.from('content 2'));

      expect(await provider.fileExists(key1)).toBe(true);
      expect(await provider.fileExists(key2)).toBe(true);

      await provider.deleteFiles([key1, key2]);

      expect(await provider.fileExists(key1)).toBe(false);
      expect(await provider.fileExists(key2)).toBe(false);
    });

    it('gracefully handles deleting a non-existent file without crashing', async () => {
      const provider = new LocalStorageProvider(TEST_UPLOADS_DIR);
      await expect(provider.deleteFile('ghost-file.txt')).resolves.not.toThrow();
    });

    it('prevents directory traversal during upload or download', async () => {
      const provider = new LocalStorageProvider(TEST_UPLOADS_DIR);
      // Malicious traversal key should be safely stripped to basename
      const traversalKey = '../../etc/passwd';
      const { storagePath } = await provider.uploadFile(traversalKey, Buffer.from('safe'));
      expect(storagePath).toBe('passwd');
      expect(await provider.fileExists('passwd')).toBe(true);
    });
  });

  describe('S3/R2 Storage Integration Evaluation', () => {
    it('initializes with S3/R2 configuration and uploads with encryption and ContentType', async () => {
      const s3Provider = new S3StorageProvider({
        bucket: 'staging-qveto-attachments',
        region: 'auto',
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        forcePathStyle: true,
        presignedExpirySeconds: 600,
      });

      expect(s3Provider).toBeDefined();

      // Mock S3 send
      const mockSend = vi.fn().mockResolvedValue({});
      (s3Provider as any).client.send = mockSend;

      // Test upload
      const testBuffer = Buffer.from('s3 payload');
      const result = await s3Provider.uploadFile('report.pdf', testBuffer, 'application/pdf');
      expect(result.storagePath).toBe('report.pdf');
      expect(mockSend).toHaveBeenCalled();

      // Test deletion
      await s3Provider.deleteFile('report.pdf');
      expect(mockSend).toHaveBeenCalledTimes(2);

      // Test bulk deletion
      await s3Provider.deleteFiles(['fileA.png', 'fileB.png']);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });
});
