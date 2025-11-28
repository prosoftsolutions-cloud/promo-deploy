import * as cdk from "aws-cdk-lib";

export interface PlatformStackProps extends cdk.StackProps {
    project: string;
    domain: string;
    cdkBucketName: string
}
