import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { PlatformStackProps } from "./types";
import {getWebsiteBucketName} from "./website-bucket-name";

export class PlatformStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly websiteBucket: s3.Bucket;
  public readonly hostedZone: route53.HostedZone;

  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props);

    const domainName = props.domain;
    const wwwDomainName = `www.${domainName}`;
    if (!props.tags?.["project"])
    {
        cdk.Tags.of(this).add("project", props.project);
    }
    // Add project and env tags to all resources in this stack

    // Create Route53 Hosted Zone for main domain
    this.hostedZone = new route53.HostedZone(this, "HostedZone", {
      zoneName: domainName,
      comment: `Hosted zone for ${props.project} website`,
    });

    // Create S3 bucket for website hosting
    this.websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      bucketName: getWebsiteBucketName(domainName),
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "error.html",
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Create Origin Access Identity for CloudFront
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      "OAI",
      {
        comment: `OAI for ${props.project} website`,
      }
    );

    // Grant read permissions to CloudFront
    this.websiteBucket.grantRead(originAccessIdentity);

    // Output warning about manual DNS configuration required
    cdk.Annotations.of(this).addWarning(
      `⚠️  MANUAL ACTION REQUIRED: Update domain registrar name servers for '${domainName}' ` +
        "to point to Route53 hosted zone (see NameServers output). " +
        "Certificate validation and website will NOT work until this is complete."
    );

    cdk.Annotations.of(this).addInfo(
      "ℹ️  DNS Validation: ACM certificate will auto-validate once name servers are updated. " +
        "DNS propagation may take up to 48 hours."
    );

    // Create ACM Certificate for HTTPS (must be in us-east-1 for CloudFront)
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: domainName,
      subjectAlternativeNames: [wwwDomainName],
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // Create CloudFront Function for www to apex redirect
    const redirectFunction = new cloudfront.Function(this, "RedirectFunction", {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
    var request = event.request;
    var host = request.headers.host.value;

    if (host === 'www.${domainName}') {
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                'location': { value: 'https://${domainName}' + request.uri }
            }
        };
    }

    return request;
}`),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // Create CloudFront Distribution
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(
          this.websiteBucket,
          {
            originAccessIdentity: originAccessIdentity,
          }
        ),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: redirectFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      domainNames: [domainName, wwwDomainName],
      certificate: certificate,
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/error.html",
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/error.html",
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      comment: `CloudFront distribution for ${props.project} website`,
    });

    // Create Route53 A record for apex domain pointing to CloudFront
    new route53.ARecord(this, "ApexAliasRecord", {
      zone: this.hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      ),
    });

    // Create Route53 A record for www subdomain pointing to CloudFront
    new route53.ARecord(this, "WwwAliasRecord", {
      zone: this.hostedZone,
      recordName: wwwDomainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      ),
    });

    // Deploy website content to S3 (if source path provided)
    new s3deploy.BucketDeployment(this, "DeployWebsite", {
        sources: [s3deploy.Source.asset("website")],
        destinationBucket: this.websiteBucket,
        distribution: this.distribution,
        distributionPaths: ["/*"],
        prune: false,
      });

    // Store root domain in Parameter Store
    new ssm.StringParameter(this, "RootDomainParameter", {
      parameterName: `/${props.project}/root-domain`,
      stringValue: props.domain,
      description: `Root domain for ${props.project}`,
    });

    // Outputs - organized by deployment steps
    new cdk.CfnOutput(this, "Step1NameServers", {
      value: cdk.Fn.join(", ", this.hostedZone.hostedZoneNameServers || []),
      description: `[ACTION REQUIRED] Configure these name servers at your domain registrar for ${domainName}`,
      exportName: `${props.project}-NameServers`,
    });

    new cdk.CfnOutput(this, "Step2HostedZoneId", {
      value: this.hostedZone.hostedZoneId,
      description: "Route53 Hosted Zone ID (for reference)",
      exportName: `${props.project}-HostedZoneId`,
    });

    new cdk.CfnOutput(this, "WebsiteURL", {
      value: `https://${domainName}`,
      description: "Website URL (available after DNS propagation)",
      exportName: `${props.project}-WebsiteURL`,
    });

    new cdk.CfnOutput(this, "WwwWebsiteURL", {
      value: `https://${wwwDomainName}`,
      description: "WWW Website URL (redirects to apex domain)",
      exportName: `${props.project}-WwwWebsiteURL`,
    });

    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: this.distribution.distributionId,
      description: "CloudFront distribution ID (for cache invalidation)",
      exportName: `${props.project}-DistributionId`,
    });

    new cdk.CfnOutput(this, "CloudFrontDomainName", {
      value: this.distribution.distributionDomainName,
      description: "CloudFront distribution domain (accessible immediately)",
      exportName: `${props.project}-CloudFrontDomain`,
    });

    new cdk.CfnOutput(this, "S3BucketName", {
      value: this.websiteBucket.bucketName,
      description: "S3 bucket name for website content",
      exportName: `${props.project}-WebsiteBucket`,
    });
  }
}
