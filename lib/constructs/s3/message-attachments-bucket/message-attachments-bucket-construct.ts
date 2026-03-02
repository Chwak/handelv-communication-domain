import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface MessageAttachmentsBucketConstructProps {
  environment: string;
  regionCode: string;
  removalPolicy?: cdk.RemovalPolicy;
}

export class MessageAttachmentsBucketConstruct extends Construct {
  public readonly messageAttachmentsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: MessageAttachmentsBucketConstructProps) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;

    // Message Attachments Bucket
    this.messageAttachmentsBucket = new s3.Bucket(this, 'MessageAttachmentsBucket', {
      bucketName: `${props.environment}-${props.regionCode}-communication-domain-message-attachments-bucket`,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: removalPolicy,
      autoDeleteObjects: removalPolicy === cdk.RemovalPolicy.DESTROY,
      cors: [
        {
          allowedOrigins: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          id: 'DeleteOldAttachments',
          enabled: true,
          expiration: cdk.Duration.days(90),
        },
      ],
    });
  }
}
