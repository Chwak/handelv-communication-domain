import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as events from "aws-cdk-lib/aws-events";
import type { Construct } from "constructs";
import type { DomainStackProps } from "./domain-stack-props";
import { CommunicationAppSyncConstruct } from "./constructs/appsync/communication-appsync/communication-appsync-construct";
import { CommunicationTablesConstruct } from "./constructs/dynamodb/communication-tables/communication-tables-construct";
import { OutboxTableConstruct } from "./constructs/dynamodb/outbox-table/outbox-table-construct";
import { SendMessageLambdaConstruct } from "./constructs/lambda/communication/send-message/send-message-lambda-construct";
import { GetConversationLambdaConstruct } from "./constructs/lambda/communication/get-conversation/get-conversation-lambda-construct";
import { ListConversationsLambdaConstruct } from "./constructs/lambda/communication/list-conversations/list-conversations-lambda-construct";
import { GetMessagesLambdaConstruct } from "./constructs/lambda/communication/get-messages/get-messages-lambda-construct";
import { MarkMessageReadLambdaConstruct } from "./constructs/lambda/communication/mark-message-read/mark-message-read-lambda-construct";
import { UploadAttachmentLambdaConstruct } from "./constructs/lambda/communication/upload-attachment/upload-attachment-lambda-construct";
import { MessageAttachmentsBucketConstruct } from "./constructs/s3/message-attachments-bucket/message-attachments-bucket-construct";
import { CommunicationAppSyncResolversConstruct } from "./constructs/appsync/communication-appsync-resolvers/communication-appsync-resolvers-construct";
import { OrderCreatedConsumerLambdaConstruct } from "./constructs/lambda/event-consumer/order-created-consumer-lambda-construct";
import { RepublishLambdaConstruct } from "./constructs/lambda/republish/republish-lambda-construct";
import { importEventBusFromSharedInfra } from "./utils/eventbridge-helper";

export class CommunicationDomainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add("Domain", "hand-made-communication-domain");
    cdk.Tags.of(this).add("Environment", props.environment);
    cdk.Tags.of(this).add("Project", "hand-made");
    cdk.Tags.of(this).add("Region", props.regionCode);
    cdk.Tags.of(this).add("StackName", this.stackName);

    const removalPolicy = props.environment === 'prod'
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY;

    const schemaRegistryName = ssm.StringParameter.valueForStringParameter(
      this,
      `/hand-made/${props.environment}/shared-infra/schema-registry-name`,
    );

    // Create S3 bucket for message attachments
    const messageAttachmentsBucket = new MessageAttachmentsBucketConstruct(this, "MessageAttachmentsBucket", {
      environment: props.environment,
      regionCode: props.regionCode,
      removalPolicy,
    });

    // Create DynamoDB tables
    const communicationTables = new CommunicationTablesConstruct(this, "CommunicationTables", {
      environment: props.environment,
      regionCode: props.regionCode,
      removalPolicy,
    });

    const outboxTable = new OutboxTableConstruct(this, "OutboxTable", {
      environment: props.environment,
      regionCode: props.regionCode,
      domainName: "communication-domain",
      removalPolicy,
    });

    const communicationAppSync = new CommunicationAppSyncConstruct(this, "CommunicationAppSync", {
      environment: props.environment,
      regionCode: props.regionCode,
    });

    // Create Lambda functions
    const sendMessageLambda = new SendMessageLambdaConstruct(this, "SendMessageLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      conversationsTable: communicationTables.conversationsTable,
      messagesTable: communicationTables.messagesTable,
      removalPolicy,
    });

    const getConversationLambda = new GetConversationLambdaConstruct(this, "GetConversationLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      conversationsTable: communicationTables.conversationsTable,
      removalPolicy,
    });

    const listConversationsLambda = new ListConversationsLambdaConstruct(this, "ListConversationsLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      conversationsTable: communicationTables.conversationsTable,
      removalPolicy,
    });

    const getMessagesLambda = new GetMessagesLambdaConstruct(this, "GetMessagesLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      messagesTable: communicationTables.messagesTable,
      removalPolicy,
    });

    const markMessageReadLambda = new MarkMessageReadLambdaConstruct(this, "MarkMessageReadLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      messagesTable: communicationTables.messagesTable,
      conversationsTable: communicationTables.conversationsTable,
      removalPolicy,
    });

    const uploadAttachmentLambda = new UploadAttachmentLambdaConstruct(this, "UploadAttachmentLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      messageAttachmentsBucket: messageAttachmentsBucket.messageAttachmentsBucket,
      removalPolicy,
    });

    // Step 0: Import shared EventBus from shared-infra
    const eventBus = importEventBusFromSharedInfra(this, props.environment);

    new RepublishLambdaConstruct(this, "RepublishLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      domainName: "communication-domain",
      outboxTable: outboxTable.table,
      eventBus,
      removalPolicy,
    });

    // Step N: Create event consumer lambdas for cross-domain events
    const orderCreatedConsumer = new OrderCreatedConsumerLambdaConstruct(this, "OrderCreatedConsumer", {
      environment: props.environment,
      regionCode: props.regionCode,
      conversationsTable: communicationTables.conversationsTable,
      outboxTable: outboxTable.table,
      eventBus,
      removalPolicy,
    });

    // Create AppSync resolvers
    const communicationResolvers = new CommunicationAppSyncResolversConstruct(this, "CommunicationResolvers", {
      api: communicationAppSync.api,
      sendMessageLambda: sendMessageLambda.function,
      getConversationLambda: getConversationLambda.function,
      listConversationsLambda: listConversationsLambda.function,
      getMessagesLambda: getMessagesLambda.function,
      markMessageReadLambda: markMessageReadLambda.function,
      uploadAttachmentLambda: uploadAttachmentLambda.function,
    });
  }
}
