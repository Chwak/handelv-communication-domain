import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

interface OrderCreatedConsumerLambdaConstructProps {
  environment: string;
  regionCode: string;
  conversationsTable: dynamodb.ITable;
  outboxTable: dynamodb.ITable;
  eventBus: events.IEventBus;
  removalPolicy: cdk.RemovalPolicy;
}

export class OrderCreatedConsumerLambdaConstruct extends Construct {
  public function: lambda.Function;

  constructor(scope: Construct, id: string, props: OrderCreatedConsumerLambdaConstructProps) {
    super(scope, id);

    const { environment, regionCode, conversationsTable, outboxTable, eventBus, removalPolicy } = props;

    // Create DLQ for failed messages
    const dlq = new sqs.Queue(this, "OrderCreatedConsumerDLQ", {
      queueName: `${environment}-${regionCode}-order-created-consumer-dlq`,
      removalPolicy,
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // Create SQS queue for order.created events
    const queue = new sqs.Queue(this, "OrderCreatedConsumerQueue", {
      queueName: `${environment}-${regionCode}-order-created-consumer-queue`,
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(3),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: dlq,
      },
      removalPolicy,
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // Create Lambda function
    this.function = new lambda.Function(this, "OrderCreatedConsumerFunction", {
      functionName: `${environment}-${regionCode}-communication-order-created-consumer`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lib/functions/lambda/event-consumer", {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            "bash",
            "-c",
            [
              "npm install",
              "cp -r node_modules /asset-output/",
              "cp *.ts /asset-output/",
            ].join(" && "),
          ],
        },
      }),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        CONVERSATIONS_TABLE_NAME: conversationsTable.tableName,
        IDEMPOTENCY_TABLE_NAME: `${environment}-${regionCode}-communication-order-created-idempotency`,
        OUTBOX_TABLE_NAME: outboxTable.tableName,
        EVENT_BUS_NAME: eventBus.eventBusName,
      },
      reservedConcurrentExecutions: 100,
    });

    // Create idempotency table
    const idempotencyTable = new dynamodb.Table(this, "OrderCreatedIdempotencyTable", {
      tableName: `${environment}-${regionCode}-communication-order-created-idempotency`,
      partitionKey: { name: "orderId", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Grant permissions
    conversationsTable.grantWriteData(this.function);
    idempotencyTable.grantReadWriteData(this.function);
    outboxTable.grantReadWriteData(this.function);

    // Create EventBridge rule to route order.created.v1 events to SQS
    const rule = new events.Rule(this, "OrderCreatedRule", {
      eventBus,
      eventPattern: {
        source: ["hand-made.order-domain"],
        detailType: ["order.created.v1"],
      },
      targets: [new targets.SqsQueue(queue)],
    });

    // Create EventSource mapping from SQS to Lambda
    this.function.addEventSourceMapping("OrderCreatedEventSourceMapping", {
      eventSourceArn: queue.queueArn,
      batchSize: 10,
    });

    // Create CloudWatch LogGroup
    new logs.LogGroup(this, "OrderCreatedConsumerLogGroup", {
      logGroupName: `/aws/lambda/${this.function.functionName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    });
  }
}
