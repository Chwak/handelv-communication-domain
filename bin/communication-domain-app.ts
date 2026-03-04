#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CommunicationDomainStack } from "../lib/communication-domain-stack";
import { CommunicationDomainPipelineStack } from "../lib/communication-domain-pipeline-stack";

const app = new cdk.App();

const environment = app.node.tryGetContext("environment") ?? "dev";
const regionCode = app.node.tryGetContext("regionCode") ?? "use1";

new CommunicationDomainStack(app, `${environment}-${regionCode}-hand-made-communication-domain-stack`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  environment,
  regionCode,
});

// Domain-scoped pipeline infrastructure
const managementAccountId = "567608120268";
const devAccountId = "741429964649";
const mimicProdAccountId = "329177708881";
const prodAccountId = "021657748325";
const githubConnectionArn = "arn:aws:codestar-connections:us-east-1:567608120268:connection/ef226671-d921-4f3e-9935-c5f2549ecb0d";

new CommunicationDomainPipelineStack(
  app,
  "CommunicationDomainPipelineStack",
  {
    env: { account: managementAccountId, region: "us-east-1" },
    domain: "communication-domain",
    managementAccountId,
    devAccountId,
    mimicProdAccountId,
    prodAccountId,
    githubConnectionArn,
    description: "Domain-scoped pipeline for communication-domain",
  }
);

app.synth();
