import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

export interface MarkMessageReadLambdaConstructProps {
  environment: string;
  regionCode: string;
  messagesTable: dynamodb.ITable;
  conversationsTable: dynamodb.ITable;
  removalPolicy?: cdk.RemovalPolicy;
}

export class MarkMessageReadLambdaConstruct extends Construct {
  public readonly function: NodejsFunction;

  constructor(scope: Construct, id: string, props: MarkMessageReadLambdaConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'MarkMessageReadLambdaRole', {
      roleName: `${props.environment}-${props.regionCode}-communication-domain-mark-message-read-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for Mark Message Read Lambda',
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
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/${props.environment}-${props.regionCode}-communication-domain-mark-message-read-lambda*`,
              ],
            }),
          ],
        }),
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:UpdateItem'],
              resources: [
                props.messagesTable.tableArn,
                props.conversationsTable.tableArn,
              ],
            }),
          ],
        }),
      },
    });

    const logGroup = new logs.LogGroup(this, 'MarkMessageReadLogGroup', {
      logGroupName: `/aws/lambda/${props.environment}-${props.regionCode}-communication-domain-mark-message-read-lambda`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    const lambdaCodePath = path.join(__dirname, '../../../../functions/lambda/communication/mark-message-read/mark-message-read-lambda.ts')
    this.function = new NodejsFunction(this, 'MarkMessageReadFunction', {
      functionName: `${props.environment}-${props.regionCode}-communication-domain-mark-message-read-lambda`,
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
        MESSAGES_TABLE_NAME: props.messagesTable.tableName,
        CONVERSATIONS_TABLE_NAME: props.conversationsTable.tableName,
        LOG_LEVEL: props.environment === 'prod' ? 'ERROR' : 'INFO',
      },
      description: 'Mark messages as read in a conversation',
    });

    props.messagesTable.grantReadWriteData(this.function);
    props.conversationsTable.grantReadWriteData(this.function);


    if (props.removalPolicy) {
      this.function.applyRemovalPolicy(props.removalPolicy);
    }
  }
}
