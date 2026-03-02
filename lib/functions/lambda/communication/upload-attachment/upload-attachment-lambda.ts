import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/communication-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const BUCKET = process.env.MESSAGE_ATTACHMENTS_BUCKET_NAME;
const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE_NAME;
const PRESIGN_EXPIRY_SECONDS = 900; // 15 minutes

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

function sanitizeFilename(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 200) return null;
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150);
  return safe || 'attachment';
}

export const handler = async (event: {
  arguments?: { filename?: unknown; contentType?: unknown; conversationId?: unknown; messageId?: unknown };
  identity?: unknown;
}) => {
  initTelemetryLogger(event, { domain: "communication-domain", service: "upload-attachment" });
  if (!BUCKET || !CONVERSATIONS_TABLE) throw new Error('Internal server error');

  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const conversationId = validateId(event.arguments?.conversationId);
  if (!conversationId) throw new Error('Invalid input format');

  const filename = sanitizeFilename(event.arguments?.filename);
  if (!filename) throw new Error('Invalid input format');

  const contentType = typeof event.arguments?.contentType === 'string'
    ? event.arguments.contentType.trim()
    : 'application/octet-stream';
  if (contentType.length > 100) throw new Error('Invalid input format');
  if (ALLOWED_CONTENT_TYPES.size > 0 && !ALLOWED_CONTENT_TYPES.has(contentType)) {
    const allowed = Array.from(ALLOWED_CONTENT_TYPES).join(', ');
    throw new Error(`Unsupported contentType. Allowed: ${allowed}`);
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const convResult = await client.send(
    new GetCommand({
      TableName: CONVERSATIONS_TABLE,
      Key: { conversationId },
    })
  );
  const conv = convResult.Item as { collectorUserId?: string; makerUserId?: string } | undefined;
  if (!conv) throw new Error('Conversation not found');
  if (conv.collectorUserId !== auth && conv.makerUserId !== auth) throw new Error('Forbidden');

  const key = `${auth}/${conversationId}/${randomUUID()}-${filename}`;
  const s3Client = new S3Client({});
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: PRESIGN_EXPIRY_SECONDS });

  return {
    uploadUrl,
    key,
    expiresInSeconds: PRESIGN_EXPIRY_SECONDS,
  };
};