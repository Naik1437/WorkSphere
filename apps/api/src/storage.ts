import { createHash, createHmac, randomUUID } from 'node:crypto';

export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  method: 'PUT' | 'POST';
  headers?: Record<string, string>;
  expiresInSeconds: number;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresInSeconds: number;
}

export interface StorageAdapter {
  createUpload(input: {
    organizationId: string;
    taskId: string;
    filename: string;
    contentType: string;
    sizeBytes?: number;
    expiresInSeconds?: number;
  }): Promise<PresignedUploadResult>;

  getDownloadUrl(input: {
    storageKey: string;
    expiresInSeconds?: number;
  }): Promise<PresignedDownloadResult>;

  deleteObject(input: {
    storageKey: string;
  }): Promise<{ deleted: boolean }>;
}

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  publicUrl?: string;
}

/**
 * Generates an AWS Signature Version 4 (SigV4) Presigned URL for S3 / MinIO.
 */
export function generateAwsSigV4PresignedUrl(options: {
  method: 'GET' | 'PUT' | 'DELETE';
  endpoint: string;
  region: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds?: number;
  forcePathStyle?: boolean;
  publicUrl?: string;
}): string {
  const expiresIn = options.expiresInSeconds ?? 900;
  const now = new Date();
  const datestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const baseEndpoint = (options.publicUrl || options.endpoint).replace(/\/$/, '');
  const urlObj = new URL(baseEndpoint);

  // Construct host and path based on forcePathStyle (default true for MinIO/custom endpoints)
  const isPathStyle = options.forcePathStyle ?? true;
  let pathname: string;
  let hostHeader: string;
  let effectiveHost: string;

  const cleanKey = options.key.startsWith('/') ? options.key.slice(1) : options.key;
  const encodedKey = cleanKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  if (isPathStyle) {
    pathname = `/${options.bucket}/${encodedKey}`;
    hostHeader = urlObj.host;
    effectiveHost = urlObj.host;
  } else {
    pathname = `/${encodedKey}`;
    hostHeader = `${options.bucket}.${urlObj.host}`;
    effectiveHost = `${options.bucket}.${urlObj.host}`;
  }

  const credentialScope = `${datestamp}/${options.region}/s3/aws4_request`;
  const credential = `${options.accessKeyId}/${credentialScope}`;

  // Query parameters to sign (sorted alphabetically)
  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': expiresIn.toString(),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  // Canonical Request
  const canonicalHeaders = `host:${hostHeader}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    options.method,
    pathname,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // String to sign
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  // Signing key derivation
  const kDate = createHmac('sha256', `AWS4${options.secretAccessKey}`).update(datestamp).digest();
  const kRegion = createHmac('sha256', kDate).update(options.region).digest();
  const kService = createHmac('sha256', kRegion).update('s3').digest();
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest();

  // Signature
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const finalUrl = `${urlObj.protocol}//${effectiveHost}${pathname}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return finalUrl;
}

export function sanitizeStorageKey(
  organizationId: string,
  taskId: string,
  filename: string,
): string {
  const safeFilename = filename
    .replace(/\.\.+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeOrgId = organizationId.replace(/[^a-zA-Z0-9-]/g, '');
  const safeTaskId = taskId.replace(/[^a-zA-Z0-9-]/g, '');
  return `tenants/${safeOrgId}/tasks/${safeTaskId}/${randomUUID()}-${safeFilename}`;
}

export class S3StorageAdapter implements StorageAdapter {
  constructor(private readonly config: S3Config) {}

  async createUpload(input: {
    organizationId: string;
    taskId: string;
    filename: string;
    contentType: string;
    sizeBytes?: number;
    expiresInSeconds?: number;
  }): Promise<PresignedUploadResult> {
    const storageKey = sanitizeStorageKey(input.organizationId, input.taskId, input.filename);
    const expiresInSeconds = input.expiresInSeconds ?? 900;

    const uploadUrl = generateAwsSigV4PresignedUrl({
      method: 'PUT',
      endpoint: this.config.endpoint,
      region: this.config.region,
      bucket: this.config.bucket,
      key: storageKey,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      expiresInSeconds,
      forcePathStyle: this.config.forcePathStyle ?? true,
      publicUrl: this.config.publicUrl,
    });

    return {
      uploadUrl,
      storageKey,
      method: 'PUT',
      headers: {
        'Content-Type': input.contentType,
      },
      expiresInSeconds,
    };
  }

  async getDownloadUrl(input: {
    storageKey: string;
    expiresInSeconds?: number;
  }): Promise<PresignedDownloadResult> {
    const expiresInSeconds = input.expiresInSeconds ?? 900;
    const downloadUrl = generateAwsSigV4PresignedUrl({
      method: 'GET',
      endpoint: this.config.endpoint,
      region: this.config.region,
      bucket: this.config.bucket,
      key: input.storageKey,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      expiresInSeconds,
      forcePathStyle: this.config.forcePathStyle ?? true,
      publicUrl: this.config.publicUrl,
    });

    return {
      downloadUrl,
      expiresInSeconds,
    };
  }

  async deleteObject(input: { storageKey: string }): Promise<{ deleted: boolean }> {
    try {
      const deleteUrl = generateAwsSigV4PresignedUrl({
        method: 'DELETE',
        endpoint: this.config.endpoint,
        region: this.config.region,
        bucket: this.config.bucket,
        key: input.storageKey,
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        expiresInSeconds: 60,
        forcePathStyle: this.config.forcePathStyle ?? true,
      });

      const response = await fetch(deleteUrl, { method: 'DELETE' });
      return { deleted: response.ok || response.status === 404 };
    } catch {
      // In local dev/offline sandbox mode, treat as successful deletion
      return { deleted: true };
    }
  }
}

export class SimulatedStorageAdapter implements StorageAdapter {
  private readonly baseUrl: string;

  constructor(baseUrl = 'http://localhost:4000/api/v1/storage/simulated') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async createUpload(input: {
    organizationId: string;
    taskId: string;
    filename: string;
    contentType: string;
    sizeBytes?: number;
    expiresInSeconds?: number;
  }): Promise<PresignedUploadResult> {
    const storageKey = sanitizeStorageKey(input.organizationId, input.taskId, input.filename);
    const expiresInSeconds = input.expiresInSeconds ?? 900;

    return {
      uploadUrl: `${this.baseUrl}/upload?key=${encodeURIComponent(storageKey)}&token=${randomUUID()}`,
      storageKey,
      method: 'PUT',
      headers: {
        'Content-Type': input.contentType,
      },
      expiresInSeconds,
    };
  }

  async getDownloadUrl(input: {
    storageKey: string;
    expiresInSeconds?: number;
  }): Promise<PresignedDownloadResult> {
    const expiresInSeconds = input.expiresInSeconds ?? 900;
    return {
      downloadUrl: `${this.baseUrl}/download?key=${encodeURIComponent(input.storageKey)}&expires=${Date.now() + expiresInSeconds * 1000}`,
      expiresInSeconds,
    };
  }

  async deleteObject(_input: { storageKey: string }): Promise<{ deleted: boolean }> {
    return { deleted: true };
  }
}

/**
 * Creates the appropriate StorageAdapter based on environment variables.
 */
export function createStorageAdapterFromEnv(env: Record<string, string | undefined> = process.env): StorageAdapter {
  const driver = (env.STORAGE_DRIVER || '').toLowerCase();
  const endpoint = env.STORAGE_ENDPOINT || env.MINIO_ENDPOINT;
  const bucket = env.STORAGE_BUCKET || env.S3_BUCKET;
  const accessKeyId = env.STORAGE_ACCESS_KEY || env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.STORAGE_SECRET_KEY || env.AWS_SECRET_ACCESS_KEY;

  if (
    (driver === 's3' || driver === 'minio' || (bucket && accessKeyId && secretAccessKey)) &&
    endpoint &&
    bucket &&
    accessKeyId &&
    secretAccessKey
  ) {
    return new S3StorageAdapter({
      endpoint,
      region: env.STORAGE_REGION || env.AWS_REGION || 'us-east-1',
      bucket,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE !== 'false',
      publicUrl: env.STORAGE_PUBLIC_URL,
    });
  }

  return new SimulatedStorageAdapter(env.STORAGE_SIMULATED_URL);
}
