import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/communication-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.CONVERSATIONS_TABLE_NAME;

export const handler = async (event: { arguments?: { conversationId?: unknown }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "communication-domain", service: "get-conversation" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const conversationId = validateId(event.arguments?.conversationId);
  if (!conversationId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const result = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { conversationId } })
  );
  const conv = result.Item;
  if (!conv) throw new Error('Conversation not found');
  if (conv.collectorUserId !== auth && conv.makerUserId !== auth) throw new Error('Forbidden');

  return conv;
};