import {
  CloudFrontClient,
  CreateInvalidationCommand,
  ListDistributionsCommand,
  ListDistributionsCommandOutput,
} from "@aws-sdk/client-cloudfront";
import { PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { S3SyncClient } from "s3-sync-client";
import { fromIni } from "@aws-sdk/credential-providers";
import { loadSharedConfigFiles } from "@smithy/shared-ini-file-loader";
import { lookup } from "mime-types";
import { DeployWebsiteOptions } from "./types";

async function getRegionFromProfile(profile: string): Promise<string> {
  const configFiles = await loadSharedConfigFiles();
  const profileName = profile || "default";

  // Check config file first, then credentials file
  const profileConfig = configFiles.configFile?.[profileName] ||
                        configFiles.credentialsFile?.[profileName];

  if (profileConfig?.region) {
    return profileConfig.region;
  }

  // Fallback to environment variable or default
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
}

async function findDistributionsForBucket(
  cloudFrontClient: CloudFrontClient,
  bucketName: string
): Promise<string[]> {
  const distributionIds: string[] = [];
  let marker: string | undefined = undefined;

  do {
    const response: ListDistributionsCommandOutput = await cloudFrontClient.send(
      new ListDistributionsCommand({
        Marker: marker,
      })
    );

    const distributions = response.DistributionList?.Items || [];

    for (const dist of distributions) {
      const origins = dist.Origins?.Items || [];
      for (const origin of origins) {
        const domainName = origin.DomainName || "";
        if (domainName.startsWith(`${bucketName}.s3`)) {
          if (dist.Id) {
            distributionIds.push(dist.Id);
            break;
          }
        }
      }
    }

    marker = response.DistributionList?.NextMarker;
  } while (marker);

  return distributionIds;
}

export async function deployWebsite(options: DeployWebsiteOptions): Promise<void> {
  const {
    bucketName,
    profile = "",
    websitePath = "website",
  } = options;

  // Get region from profile configuration
  const region = await getRegionFromProfile(profile);
  console.log(`Using region: ${region}`);

  // Create credentials - use default chain if no profile specified
  const credentials = profile ? fromIni({ profile }) : undefined;

  const s3Client = new S3Client({
    region,
    credentials,
  });

  const cloudFrontClient = new CloudFrontClient({
    region,
    credentials,
  });

  const syncClient = new S3SyncClient({ client: s3Client });

  console.log(`Syncing "${websitePath}" to s3://${bucketName}...`);

  try {
    await syncClient.sync(websitePath, `s3://${bucketName}`, {
      del: true,
      commandInput: (input: Partial<PutObjectCommandInput>) => ({
        ContentType: lookup(input.Key || "") || "application/octet-stream",
      }),
    });
    console.log("S3 sync completed successfully");
  } catch (error: any) {
    throw new Error(`S3 sync failed: ${error.message}`);
  }

  // Find and invalidate all CloudFront distributions linked to this bucket
  const distributionIds = await findDistributionsForBucket(cloudFrontClient, bucketName);

  if (distributionIds.length === 0) {
    console.log("No CloudFront distributions found for this bucket");
  } else {
    console.log(`Found ${distributionIds.length} CloudFront distribution(s) linked to bucket`);

    for (const distributionId of distributionIds) {
      await cloudFrontClient.send(
        new CreateInvalidationCommand({
          DistributionId: distributionId,
          InvalidationBatch: {
            CallerReference: `${Date.now()}-${distributionId}`,
            Paths: {
              Quantity: 1,
              Items: ["/*"],
            },
          },
        })
      );
      console.log(`CloudFront invalidation created for ${distributionId}`);
    }
  }
}
