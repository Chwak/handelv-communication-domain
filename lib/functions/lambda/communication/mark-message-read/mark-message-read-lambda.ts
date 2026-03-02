import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/communication-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const MESSAGES_TABLE = process.env.MESSAGES_TABLE_NAME;
const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE_NAME;
const GSI2_MESSAGE_ID = 'GSI2-MessageId';

export const handler = async (event: { arguments?: { messageId?: unknown; conversationId?: unknown }; identity?: any; headers?: Record<string, string> }) => {
  initTelemetryLogger(event, { domain: "communication-domain", service: "mark-message-read" });
  if (!MESSAGES_TABLE || !CONVERSATIONS_TABLE) throw new Error('Internal server error');

  const messageId = validateId(event.arguments?.messageId);
  if (!messageId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  let msg: Record<string, unknown> | undefined;
  const conversationIdArg = validateId((event.arguments as { conversationId?: unknown })?.conversationId);

  if (conversationIdArg) {
    const getResult = await client.send(
      new GetCommand({
        TableName: MESSAGES_TABLE,
        Key: { conversationId: conversationIdArg, messageId },
      })
    );
    msg = getResult.Item as Record<string, unknown> | undefined;
  }

  if (!msg) {
    const queryResult = await client.send(
      new QueryCommand({
        TableName: MESSAGES_TABLE,
        IndexName: GSI2_MESSAGE_ID,
        KeyConditionExpression: 'messageId = :mid',
        ExpressionAttributeValues: { ':mid': messageId },
        Limit: 1,
      })
    );
    msg = queryResult.Items?.[0] as Record<string, unknown> | undefined;
  }

  if (!msg) throw new Error('Message not found');

  const convResult = await client.send(
    new GetCommand({
      TableName: CONVERSATIONS_TABLE,
      Key: { conversationId: msg.conversationId },
    })
  );
  const conv = convResult.Item as { collectorUserId?: string; makerUserId?: string } | undefined;
  if (!conv) throw new Error('Conversation not found');
  const recipient = msg.senderId === conv.collectorUserId ? conv.makerUserId : conv.collectorUserId;
  if (recipient !== auth) throw new Error('Forbidden');

  const now = new Date().toISOString();
  const result = await client.send(
    new UpdateCommand({
      TableName: MESSAGES_TABLE,
      Key: { conversationId: msg.conversationId, messageId },
      UpdateExpression: 'SET readAt = if_not_exists(readAt, :now)',
      ExpressionAttributeValues: { ':now': now },
      ReturnValues: 'ALL_NEW',
    })
  );
  return (result.Attributes ?? msg) as Record<string, unknown>;
};