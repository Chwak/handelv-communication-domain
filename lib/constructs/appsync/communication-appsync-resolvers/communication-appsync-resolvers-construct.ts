import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface CommunicationAppSyncResolversConstructProps {
  api: appsync.IGraphqlApi;
  sendMessageLambda?: lambda.IFunction;
  getConversationLambda?: lambda.IFunction;
  listConversationsLambda?: lambda.IFunction;
  getMessagesLambda?: lambda.IFunction;
  markMessageReadLambda?: lambda.IFunction;
  uploadAttachmentLambda?: lambda.IFunction;
}

export class CommunicationAppSyncResolversConstruct extends Construct {
  constructor(scope: Construct, id: string, props: CommunicationAppSyncResolversConstructProps) {
    super(scope, id);

    if (props.sendMessageLambda) {
      const sendMessageDataSource = props.api.addLambdaDataSource(
        'SendMessageDataSource',
        props.sendMessageLambda
      );

      sendMessageDataSource.createResolver('SendMessageResolver', {
        typeName: 'Mutation',
        fieldName: 'sendMessage',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.getConversationLambda) {
      const getConversationDataSource = props.api.addLambdaDataSource(
        'GetConversationDataSource',
        props.getConversationLambda
      );

      getConversationDataSource.createResolver('GetConversationResolver', {
        typeName: 'Query',
        fieldName: 'getConversation',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.listConversationsLambda) {
      const listConversationsDataSource = props.api.addLambdaDataSource(
        'ListConversationsDataSource',
        props.listConversationsLambda
      );

      listConversationsDataSource.createResolver('ListConversationsResolver', {
        typeName: 'Query',
        fieldName: 'listConversations',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.getMessagesLambda) {
      const getMessagesDataSource = props.api.addLambdaDataSource(
        'GetMessagesDataSource',
        props.getMessagesLambda
      );

      getMessagesDataSource.createResolver('GetMessagesResolver', {
        typeName: 'Query',
        fieldName: 'getMessages',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.markMessageReadLambda) {
      const markMessageReadDataSource = props.api.addLambdaDataSource(
        'MarkMessageReadDataSource',
        props.markMessageReadLambda
      );

      markMessageReadDataSource.createResolver('MarkMessageReadResolver', {
        typeName: 'Mutation',
        fieldName: 'markMessageRead',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // Note: uploadAttachment is not exposed as GraphQL mutation - handled via S3 presigned URLs
    // if (props.uploadAttachmentLambda) {
    //   const uploadAttachmentDataSource = props.api.addLambdaDataSource(
    //     'UploadAttachmentDataSource',
    //     props.uploadAttachmentLambda
    //   );

    //   uploadAttachmentDataSource.createResolver('UploadAttachmentResolver', {
    //     typeName: 'Mutation',
    //     fieldName: 'uploadAttachment',
    //     requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
    //     responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    //   });
    // }
  }
}
