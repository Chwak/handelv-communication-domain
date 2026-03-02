import { randomUUID } from "crypto";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { SQSEvent, SQSRecord } from "aws-lambda";

const dynamodb = new DynamoDBClient({});
const dynamodbDoc = DynamoDBDocumentClient.from(dynamodb);

const CONVERSATIONS_TABLE_NAME = process.env.CONVERSATIONS_TABLE_NAME || "";
const IDEMPOTENCY_TABLE_NAME = process.env.IDEMPOTENCY_TABLE_NAME || "";
const OUTBOX_TABLE_NAME = process.env.OUTBOX_TABLE_NAME || "";

interface OrderCreatedEvent {
  orderId: string;
  collectorUserId: string;
  makerUserId?: string;
  makerUserIds?: string[];
  totalAmount: number;
  currency: string;
  itemCount: number;
  createdAt: string;
}

interface Conversation {
  conversationId: string;
  orderId: string;
  collectorUserId: string;
  makerUserId: string;
  participantIds: string[];
  createdAt: string;
  updatedAt: string;
  subject: string;
  lastMessage?: string;
  lastMessageAt?: string;
}

export async function handler(event: SQSEvent): Promise<{ batchItemFailures: Array<{ itemId: string }> }> {
  console.log("Order created consumer start", { recordCount: event.Records.length });

  const batchItemFailures: Array<{ itemId: string }> = [];

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error(`Error processing record ${record.messageId}:`, error);
      batchItemFailures.push({ itemId: record.messageId });
    }
  }

  return { batchItemFailures };
}

async function processRecord(record: SQSRecord): Promise<void> {
  // Parse SQS message body (EventBridge envelope)
  const body = JSON.parse(record.body);
  const detail = body.detail as OrderCreatedEvent;

  // Validate required fields
  if (!detail.orderId || !detail.collectorUserId) {
    throw new Error("Missing required fields: orderId or collectorUserId");
  }

  const { orderId, collectorUserId } = detail;
  const makerUserIds = detail.makerUserIds ?? (detail.makerUserId ? [detail.makerUserId] : []);

  console.log('Processing order.created.v1', { orderId });

  // Check idempotency
  const idempotencyResult = await checkIdempotency(orderId);
  if (idempotencyResult?.processed) {
    console.log(`Order ${orderId} already processed, skipping`);
    return;
  }

  // Create a conversation for each maker-buyer pair
  const conversations: Array<{ conversationId: string; makerUserId: string }> = [];
  for (const makerId of makerUserIds) {
    const conversationId = await createConversation(orderId, collectorUserId, makerId);
    conversations.push({ conversationId, makerUserId: makerId });
  }

  // Record idempotency
  await recordIdempotency(orderId);

  // Publish message.sent.v1 event for audit trail
  await publishMessageSentEvent(orderId, collectorUserId, conversations);
}

async function createConversation(orderId: string, collectorUserId: string, makerUserId: string): Promise<string> {
  const conversationId = `conversation-${randomUUID()}`;
  const now = new Date().toISOString();

  const conversation: Conversation = {
    conversationId,
    orderId,
    collectorUserId,
    makerUserId,
    participantIds: [collectorUserId, makerUserId],
    createdAt: now,
    updatedAt: now,
    subject: `Order #${orderId} - Initial Contact`,
  };

  console.log('Creating conversation', { orderId });

  await dynamodbDoc.send(
    new PutCommand({
      TableName: CONVERSATIONS_TABLE_NAME,
      Item: conversation,
    })
  );

  return conversationId;
}

async function checkIdempotency(orderId: string): Promise<{ processed: boolean } | null> {
  try {
    const result = await dynamodbDoc.send(
      new GetCommand({
        TableName: IDEMPOTENCY_TABLE_NAME,
        Key: { orderId },
      })
    );

    return result.Item as { processed: boolean } | null;
  } catch (error) {
    console.warn("Error checking idempotency:", error);
    return null;
  }
}

async function recordIdempotency(orderId: string): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // ✅ CRITICAL FIX: 7 days (was 24h)

  await dynamodbDoc.send(
    new PutCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Item: {
        orderId,
        processed: true,
        createdAt: new Date().toISOString(),
        ttl,
      },
    })
  );
}

async function publishMessageSentEvent(
  orderId: string,
  collectorUserId: string,
  conversations: Array<{ conversationId: string; makerUserId: string }>
): Promise<void> {
  const timestamp = new Date().toISOString();

  for (const conversation of conversations) {
    const eventId = randomUUID();
    const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days

    console.log('Publishing message.sent.v1 to outbox', { conversationId: conversation.conversationId, orderId });

    await dynamodbDoc.send(
      new PutCommand({
        TableName: OUTBOX_TABLE_NAME,
        Item: {
          eventId,
          eventType: "message.sent.v1",
          eventVersion: 1,
          correlationId: orderId,
          payload: JSON.stringify({
            messageId: `message-${randomUUID()}`,
            conversationId: conversation.conversationId,
            orderId,
            senderId: collectorUserId,
            recipientId: conversation.makerUserId,
            messageBody: `Order #${orderId} - Initial communication thread created`,
            messageType: "system",
            timestamp,
          }),
          status: "PENDING",
          createdAt: timestamp,
          retries: 0,
          expiresAt: ttl,
        },
      })
    );

    console.log(`Published message.sent.v1 to outbox: ${eventId}`);
  }
}
