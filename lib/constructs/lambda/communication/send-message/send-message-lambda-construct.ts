import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

export interface SendMessageLambdaConstructProps {
  environment: string;
  regionCode: string;
  conversationsTable: dynamodb.ITable;
  messagesTable: dynamodb.ITable;
  removalPolicy?: cdk.RemovalPolicy;
}

export class SendMessageLambdaConstruct extends Construct {
  public readonly function: NodejsFunction;

  constructor(scope: Construct, id: string, props: SendMessageLambdaConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'SendMessageLambdaRole', {
      roleName: `${props.environment}-${props.regionCode}-communication-domain-send-message-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for Send Message Lambda',
      inlinePolicies: {
        CloudWatchLogsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/${props.environment}-${props.regionCode}-communication-domain-send-message-lambda*`,
              ],
            }),
          ],
        }),
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:PutItem', 'dynamodb:UpdateItem'],
              resources: [
                props.conversationsTable.tableArn,
                props.messagesTable.tableArn,
              ],
            }),
          ],
        }),
      },
    });

    const logGroup = new logs.LogGroup(this, 'SendMessageLogGroup', {
      logGroupName: `/aws/lambda/${props.environment}-${props.regionCode}-communication-domain-send-message-lambda`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    const lambdaCodePath = path.join(__dirname, '../../../../functions/lambda/communication/send-message/send-message-lambda.ts')
    this.function = new NodejsFunction(this, 'SendMessageFunction', {
      functionName: `${props.environment}-${props.regionCode}-communication-domain-send-message-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: lambdaCodePath,
      role,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      tracing: lambda.Tracing.DISABLED,
      logGroup,
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node22',
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        ENVIRONMENT: props.environment,
        REGION_CODE: props.regionCode,
        CONVERSATIONS_TABLE_NAME: props.conversationsTable.tableName,
        MESSAGES_TABLE_NAME: props.messagesTable.tableName,
        LOG_LEVEL: props.environment === 'prod' ? 'ERROR' : 'INFO',
      },
      description: 'Send a message in a conversation',
    });

    props.conversationsTable.grantReadWriteData(this.function);
    props.messagesTable.grantWriteData(this.function);


    if (props.removalPolicy) {
      this.function.applyRemovalPolicy(props.removalPolicy);
    }
  }
}
