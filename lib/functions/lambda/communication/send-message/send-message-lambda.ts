import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/communication-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";


const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE_NAME;
const MESSAGES_TABLE = process.env.MESSAGES_TABLE_NAME;

interface SendMessageInput {
  conversationId?: unknown;
  senderId?: unknown;
  content?: unknown;
  attachments?: unknown[];
}

export const handler = async (event: { arguments?: { input?: SendMessageInput }; identity?: any; headers?: Record<string, string> }) => {
  initTelemetryLogger(event, { domain: "communication-domain", service: "send-message" });
  if (!CONVERSATIONS_TABLE || !MESSAGES_TABLE) throw new Error('Internal server error');

  const input = event.arguments?.input || {};
  const conversationId = validateId(input.conversationId);
  const senderId = validateId(input.senderId);
  if (!conversationId || !senderId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth || auth !== senderId) throw new Error('Forbidden');

  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (content.length < 1 || content.length > 5000) throw new Error('Invalid input format');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const convResult = await client.send(
    new GetCommand({ TableName: CONVERSATIONS_TABLE, Key: { conversationId } })
  );
  const conv = convResult.Item;
  if (!conv) throw new Error('Conversation not found');
  if (conv.collectorUserId !== senderId && conv.makerUserId !== senderId) throw new Error('Forbidden');

  const now = new Date().toISOString();
  const messageId = randomUUID();
  const message = {
    conversationId,
    messageId,
    senderId,
    content,
    attachments: Array.isArray(input.attachments) ? input.attachments.slice(0, 10) : [],
    createdAt: now,
    readAt: null,
  };

  await client.send(
    new PutCommand({ TableName: MESSAGES_TABLE, Item: message })
  );

  await client.send(
    new UpdateCommand({
      TableName: CONVERSATIONS_TABLE,
      Key: { conversationId },
      UpdateExpression: 'SET lastMessageAt = :now',
      ExpressionAttributeValues: { ':now': now },
    })
  );

  return message;
};