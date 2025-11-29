# Publish Package

Publish the @prosoftsolutions/platform-infra package to npm.

## Steps to perform:

1. **Build the project**
   - Run `npm run build` to compile TypeScript
   - Verify build succeeds without errors

2. **Version bump** (ask user which type):
   - patch (1.1.3 -> 1.1.4) - bug fixes
   - minor (1.1.3 -> 1.2.0) - new features
   - major (1.1.3 -> 2.0.0) - breaking changes
   - none - skip version bump

3. **Git operations**:
   - Stage all changes
   - Commit with message: "v{version} - {summary of changes}"
   - Create git tag: v{version}
   - Push to origin with tags

4. **Publish to npm**:
   - Run `npm publish --access public`

5. **Report results**:
   - Show the published version
   - Show npm package URL: https://www.npmjs.com/package/@prosoftsolutions/platform-infra
