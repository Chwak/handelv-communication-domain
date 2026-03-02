import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";
import {
  encodeNextToken,
  parseNextToken,
  requireAuthenticatedUser,
  validateId,
  validateLimit,
} from '../../../../utils/communication-validation';

const MESSAGES_TABLE = process.env.MESSAGES_TABLE_NAME;
const CONVERSATIONS_TABLE = process.env.CONVERSATIONS_TABLE_NAME;

export const handler = async (event: {
  arguments?: { conversationId?: unknown; limit?: unknown; nextToken?: unknown };
  identity?: any;
}) => {
  initTelemetryLogger(event, { domain: "communication-domain", service: "get-messages" });
  if (!MESSAGES_TABLE || !CONVERSATIONS_TABLE) throw new Error('Internal server error');

  const conversationId = validateId(event.arguments?.conversationId);
  if (!conversationId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const conv = await client.send(
    new GetCommand({ TableName: CONVERSATIONS_TABLE, Key: { conversationId } })
  );
  if (!conv.Item) throw new Error('Conversation not found');
  if (conv.Item.collectorUserId !== auth && conv.Item.makerUserId !== auth) throw new Error('Forbidden');

  const limit = validateLimit(event.arguments?.limit, 20, 100);
  const startKey = parseNextToken(event.arguments?.nextToken);

  const result = await client.send(
    new QueryCommand({
      TableName: MESSAGES_TABLE,
      KeyConditionExpression: 'conversationId = :cid',
      ExpressionAttributeValues: { ':cid': conversationId },
      Limit: limit,
      ExclusiveStartKey: startKey,
      ScanIndexForward: false,
    })
  );

  const items = result.Items ?? [];
  const next = encodeNextToken(result.LastEvaluatedKey as Record<string, unknown> | undefined);
  return { items, nextToken: next };
};