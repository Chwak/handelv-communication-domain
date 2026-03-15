import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';

export interface UploadAttachmentLambdaConstructProps {
  environment: string;
  regionCode: string;
  messageAttachmentsBucket: s3.IBucket;
  removalPolicy?: cdk.RemovalPolicy;
}

export class UploadAttachmentLambdaConstruct extends Construct {
  public readonly function: NodejsFunction;

  constructor(scope: Construct, id: string, props: UploadAttachmentLambdaConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'UploadAttachmentLambdaRole', {
      roleName: `${props.environment}-${props.regionCode}-communication-domain-upload-attachment-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for Upload Attachment Lambda',
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
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/${props.environment}-${props.regionCode}-communication-domain-upload-attachment-lambda*`,
              ],
            }),
          ],
        }),
      },
    });

    // Add S3 permissions
    role.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
        resources: [`${props.messageAttachmentsBucket.bucketArn}/*`],
      })
    );

    const logGroup = new logs.LogGroup(this, 'UploadAttachmentLogGroup', {
      logGroupName: `/aws/lambda/${props.environment}-${props.regionCode}-communication-domain-upload-attachment-lambda`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    const lambdaCodePath = path.join(__dirname, '../../../../functions/lambda/communication/upload-attachment/upload-attachment-lambda.ts')
    this.function = new NodejsFunction(this, 'UploadAttachmentFunction', {
      functionName: `${props.environment}-${props.regionCode}-communication-domain-upload-attachment-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: lambdaCodePath,
      role,
      timeout: cdk.Duration.seconds(60), // Longer timeout for file uploads
      memorySize: 512, // More memory for file processing
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
        MESSAGE_ATTACHMENTS_BUCKET_NAME: props.messageAttachmentsBucket.bucketName,
        LOG_LEVEL: props.environment === 'prod' ? 'ERROR' : 'INFO',
      },
      description: 'Upload message attachment to S3 and return presigned URL',
    });

    props.messageAttachmentsBucket.grantReadWrite(this.function);


    if (props.removalPolicy) {
      this.function.applyRemovalPolicy(props.removalPolicy);
    }
  }
}
