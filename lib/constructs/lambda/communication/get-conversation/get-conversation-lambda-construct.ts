import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

export interface GetConversationLambdaConstructProps {
  environment: string;
  regionCode: string;
  conversationsTable: dynamodb.ITable;
  removalPolicy?: cdk.RemovalPolicy;
}

export class GetConversationLambdaConstruct extends Construct {
  public readonly function: NodejsFunction;

  constructor(scope: Construct, id: string, props: GetConversationLambdaConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'GetConversationLambdaRole', {
      roleName: `${props.environment}-${props.regionCode}-communication-domain-get-conversation-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for Get Conversation Lambda',
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
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/${props.environment}-${props.regionCode}-communication-domain-get-conversation-lambda*`,
              ],
            }),
          ],
        }),
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:GetItem'],
              resources: [props.conversationsTable.tableArn],
            }),
          ],
        }),
      },
    });

    const logGroup = new logs.LogGroup(this, 'GetConversationLogGroup', {
      logGroupName: `/aws/lambda/${props.environment}-${props.regionCode}-communication-domain-get-conversation-lambda`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    const lambdaCodePath = path.join(__dirname, '../../../../functions/lambda/communication/get-conversation/get-conversation-lambda.ts')
    this.function = new NodejsFunction(this, 'GetConversationFunction', {
      functionName: `${props.environment}-${props.regionCode}-communication-domain-get-conversation-lambda`,
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
        LOG_LEVEL: props.environment === 'prod' ? 'ERROR' : 'INFO',
      },
      description: 'Get conversation by conversation ID',
    });

    props.conversationsTable.grantReadData(this.function);

    if (props.removalPolicy) {
      this.function.applyRemovalPolicy(props.removalPolicy);
    }
  }
}
