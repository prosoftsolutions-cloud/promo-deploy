import * as cdk from "aws-cdk-lib";

export interface PlatformStackProps extends cdk.StackProps {
    project: string;
    domain: string;
    cdkBucketName: string
}

export interface DeployWebsiteOptions {
  bucketName: string;
  profile?: string;
  websitePath?: string;
}
