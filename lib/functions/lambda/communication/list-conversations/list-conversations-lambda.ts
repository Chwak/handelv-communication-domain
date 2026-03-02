import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";
import {
  encodeNextToken,
  parseNextToken,
  requireAuthenticatedUser,
  validateId,
  validateLimit,
} from '../../../../utils/communication-validation';

const TABLE_NAME = process.env.CONVERSATIONS_TABLE_NAME;

export const handler = async (event: {
  arguments?: { userId?: unknown; limit?: unknown; nextToken?: unknown };
  identity?: any;
}) => {
  initTelemetryLogger(event, { domain: "communication-domain", service: "list-conversations" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const userId = validateId(event.arguments?.userId);
  if (!userId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth || auth !== userId) throw new Error('Forbidden');

  const limit = validateLimit(event.arguments?.limit, 20, 100);
  const startToken = parseNextToken(event.arguments?.nextToken) as
    | { collector?: Record<string, unknown>; maker?: Record<string, unknown> }
    | undefined;
  const collectorStartKey = startToken?.collector as Record<string, unknown> | undefined;
  const makerStartKey = startToken?.maker as Record<string, unknown> | undefined;

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  const byCollector = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1-CollectorUserId',
      KeyConditionExpression: 'collectorUserId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      Limit: limit,
      ExclusiveStartKey: collectorStartKey,
      ScanIndexForward: false,
    })
  );

  const byMaker = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI2-MakerUserId',
      KeyConditionExpression: 'makerUserId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      Limit: limit,
      ExclusiveStartKey: makerStartKey,
      ScanIndexForward: false,
    })
  );

  const seen = new Set<string>();
  const merged: Record<string, unknown>[] = [];
  for (const item of [...(byCollector.Items ?? []), ...(byMaker.Items ?? [])]) {
    const cid = (item as any).conversationId;
    if (cid && !seen.has(cid)) {
      seen.add(cid);
      merged.push(item as Record<string, unknown>);
    }
  }
  merged.sort((a, b) => ((b.lastMessageAt as string) || '').localeCompare((a.lastMessageAt as string) || ''));
  const items = merged.slice(0, limit);
  const nextToken = (byCollector.LastEvaluatedKey || byMaker.LastEvaluatedKey)
    ? encodeNextToken({
        collector: byCollector.LastEvaluatedKey as Record<string, unknown> | undefined,
        maker: byMaker.LastEvaluatedKey as Record<string, unknown> | undefined,
      })
    : null;
  return { items, nextToken };
};