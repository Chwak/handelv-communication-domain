import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface CommunicationTablesConstructProps {
  environment: string;
  regionCode: string;
  removalPolicy?: cdk.RemovalPolicy;
}

export class CommunicationTablesConstruct extends Construct {
  public readonly conversationsTable: dynamodb.Table;
  public readonly messagesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: CommunicationTablesConstructProps) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;

    // Conversations Table
    this.conversationsTable = new dynamodb.Table(this, 'ConversationsTable', {
      tableName: `${props.environment}-${props.regionCode}-communication-domain-conversations-table`,
      partitionKey: {
        name: 'conversationId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI: conversations by collector
    this.conversationsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-CollectorUserId',
      partitionKey: {
        name: 'collectorUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'lastMessageAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: conversations by maker
    this.conversationsTable.addGlobalSecondaryIndex({
      indexName: 'GSI2-MakerUserId',
      partitionKey: {
        name: 'makerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'lastMessageAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Messages Table
    this.messagesTable = new dynamodb.Table(this, 'MessagesTable', {
      tableName: `${props.environment}-${props.regionCode}-communication-domain-messages-table`,
      partitionKey: {
        name: 'conversationId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'messageId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI: messages by sender
    this.messagesTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-SenderId',
      partitionKey: {
        name: 'senderId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: lookup message by messageId (unique) for markMessageRead without conversationId
    this.messagesTable.addGlobalSecondaryIndex({
      indexName: 'GSI2-MessageId',
      partitionKey: {
        name: 'messageId',
        type: dynamodb.AttributeType.STRING,
      },
    });
  }
}
