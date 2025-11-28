import * as cdk from "aws-cdk-lib";
import { PromoDeployStack } from "./stack";

export interface DeployProps {
  region: string;
  awsAccount: string;
  cdkBucket: string;
}

export function Deploy(props: DeployProps): cdk.App {
  const { region, awsAccount, cdkBucket } = props;

  const app = new cdk.App();

  new PromoDeployStack(app, "PromoDeployStack", {
    env: {
      account: awsAccount,
      region: region,
    },
    synthesizer: new cdk.DefaultStackSynthesizer({
      fileAssetsBucketName: cdkBucket,
    }),
  });

  return app;
}

// Run deployment when executed directly
const app = Deploy({
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  awsAccount: process.env.CDK_DEFAULT_ACCOUNT || "",
  cdkBucket: process.env.CDK_BUCKET || "",
});
app.synth();
