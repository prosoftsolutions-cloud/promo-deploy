import * as cdk from "aws-cdk-lib";
import {PlatformStackProps} from "./types";
import {PlatformStack} from "./platform-stack";

// Re-export types and classes
export { PlatformStack } from "./platform-stack";

function BuildStack(props: PlatformStackProps): cdk.App {
    const app = new cdk.App();
    new PlatformStack(app, props.project + "-stack", props);
    return app;
}

export default BuildStack