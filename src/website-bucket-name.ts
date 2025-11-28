/**
 * Generates an S3 bucket name for website content based on a domain.
 * Converts domain to S3-compliant format: lowercase, dots replaced with hyphens.
 * @param domain - The domain name (e.g., "example.com", "www.my-site.org")
 * @returns S3-compliant bucket name (e.g., "example-com-website")
 */
export function getWebsiteBucketName(domain: string): string {
  const sanitized = domain
    .toLowerCase()
    .replace(/\./g, "-")           // Replace dots with hyphens
    .replace(/[^a-z0-9-]/g, "")    // Remove invalid characters
    .replace(/-+/g, "-")           // Collapse multiple hyphens
    .replace(/^-|-$/g, "");        // Trim leading/trailing hyphens

  const bucketName = `${sanitized}-website`;

  // S3 bucket names must be 3-63 characters
  if (bucketName.length < 3) {
    throw new Error(`Bucket name too short: "${bucketName}"`);
  }
  if (bucketName.length > 63) {
    throw new Error(`Bucket name too long: "${bucketName}" (${bucketName.length} chars, max 63)`);
  }

  return bucketName;
}
