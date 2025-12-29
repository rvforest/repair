#!/bin/bash
# Script to create GitHub issues from code review
# Requires: gh (GitHub CLI) to be installed and authenticated

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
    echo "Install from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with GitHub CLI${NC}"
    echo "Run: gh auth login"
    exit 1
fi

echo -e "${GREEN}Creating GitHub issues from code review...${NC}\n"

# Critical Issues
echo -e "${RED}Creating CRITICAL issues...${NC}"

gh issue create \
  --title "🚨 CLI bug: --no-cache flag broken" \
  --label "bug,critical,cli" \
  --body "**Priority:** CRITICAL
**File:** \`src/cli.ts:20\`

## Description
The \`--no-cache\` command-line flag does not work correctly. Commander's \`--no-cache\` sets \`options.cache\` to \`false\`, but the code passes \`options.cache\` directly, which is \`undefined\` when the flag is not specified.

## Current Code
\`\`\`typescript
await main({
  cacheEnabled: options.cache,  // BUG: undefined when flag not used
  confirmBeforeSend: options.confirm,
  verbose: options.verbose || options.debug,
});
\`\`\`

## Impact
- Users cannot disable caching from the command line
- Default config setting for caching may be ignored

## Recommended Fix
\`\`\`typescript
await main({
  cacheEnabled: options.cache !== false,
  confirmBeforeSend: options.confirm,
  verbose: options.verbose || options.debug,
});
\`\`\`

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "🚨 Regex race condition in security filter" \
  --label "bug,critical,security" \
  --body "**Priority:** CRITICAL
**File:** \`src/security/index.ts:34-40\`

## Description
The \`detectSecrets()\` method uses \`.test()\` on regex patterns with the \`/g\` flag, causing stateful behavior. The \`lastIndex\` property persists between calls, leading to unpredictable results.

## Impact
- Security checks may fail intermittently
- Same text may be redacted sometimes but not others
- Unreliable secret detection

## Recommended Fix
\`\`\`typescript
detectSecrets(text: string): boolean {
  for (const pattern of this.secretPatterns) {
    const result = pattern.test(text);
    pattern.lastIndex = 0;  // Reset regex state
    if (result) {
      return true;
    }
  }
  return false;
}
\`\`\`

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "🚨 truncateOutput() never called - causes token limit errors" \
  --label "bug,critical,llm" \
  --body "**Priority:** CRITICAL
**File:** \`src/llm/base.ts:79-103\`

## Description
The \`truncateOutput()\` method is defined but never called by any LLM provider. Long terminal outputs will cause:
- Token limit exceeded errors
- Increased API costs
- Request failures

## Recommended Fix
Call it in \`buildUserPrompt()\`:
\`\`\`typescript
protected buildUserPrompt(request: AnalysisRequest): string {
  let prompt = \`Command that was run:\n\\\`\\\`\\\`\n\${request.command}\n\\\`\\\`\\\`\n\n\`;
  prompt += \`Output:\n\\\`\\\`\\\`\n\${this.truncateOutput(request.output)}\n\\\`\\\`\\\`\n\n\`;
  // ...
}
\`\`\`

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "🚨 Missing timeout and retry logic for API requests" \
  --label "bug,critical,llm,error-handling" \
  --body "**Priority:** CRITICAL
**Files:** \`src/llm/openai.ts\`, \`src/llm/anthropic.ts\`

## Description
LLM API requests have no timeout or retry logic, causing:
- Indefinite hangs on network issues
- No recovery from transient failures
- Application crashes on network errors

## Recommended Fix
Add timeout using AbortController and retry logic for transient errors (429, 500, 503).

See REVIEW_ISSUES.md for full details and code example."

gh issue create \
  --title "🚨 Version comparison doesn't handle semantic versioning" \
  --label "bug,high,zellij-integration" \
  --body "**Priority:** HIGH
**File:** \`src/zellij/index.ts:58-66\`

## Description
The \`compareVersions()\` method:
- Assumes exactly 3 version parts (fails on \`1.0\`)
- Doesn't handle pre-release versions (\`0.38.0-beta\`)
- No validation for undefined parts

## Recommended Fix
Use the \`semver\` package for proper semantic version comparison.

See REVIEW_ISSUES.md for full details."

# High Priority Issues
echo -e "\n${YELLOW}Creating HIGH priority issues...${NC}"

gh issue create \
  --title "⚠️ Overly broad secret detection causes false positives" \
  --label "bug,high,security" \
  --body "**Priority:** HIGH
**File:** \`src/security/index.ts:6\`

## Description
The pattern \`/\b[A-Za-z0-9]{32,}\b/g\` matches ANY 32+ character alphanumeric string, causing false positives:
- Git commit hashes (40 chars)
- Package checksums
- Docker image IDs
- UUIDs, Base64 data, hex strings

## Impact
Legitimate error output gets redacted, making the tool unusable for many errors.

## Recommended Fix
Remove this pattern or make it much more specific with context.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "Synchronous file operations block event loop" \
  --label "performance,code-quality,high" \
  --body "**Priority:** HIGH
**Files:** \`src/config/index.ts\`, \`src/cache/index.ts\`

## Description
Using synchronous file I/O (\`fs.readFileSync\`, \`fs.writeFileSync\`) blocks the Node.js event loop.

## Recommended Fix
Use \`fs.promises\` for async file operations.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "Weak type safety with 'as any' casts" \
  --label "code-quality,typescript,high" \
  --body "**Priority:** HIGH
**Files:** \`src/llm/openai.ts:40\`, \`src/llm/anthropic.ts:37\`

## Description
Using \`as any\` defeats TypeScript's type safety and can lead to runtime errors.

## Recommended Fix
Define proper response interfaces for each LLM provider.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "Missing ESLint and Prettier configuration" \
  --label "tooling,code-quality,high" \
  --body "**Priority:** HIGH

## Description
ESLint and Prettier are in \`devDependencies\` but have no config files.

## Impact
- No consistent code style enforcement
- No automated code quality checks
- \`npm run lint\` may fail or use defaults

## Recommended Fix
Add \`.eslintrc.js\` and \`.prettierrc.json\` configuration files.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "Insufficient test coverage (~5%)" \
  --label "testing,quality-assurance,high" \
  --body "**Priority:** HIGH

## Description
Only one test file exists (\`src/config/index.test.ts\`), providing ~5% coverage.

## Missing Tests
- Zellij integration
- LLM providers (all 5)
- Security filter
- Cache manager
- Output formatter
- Integration tests

## Goal
Achieve at least 70% coverage before v1.0.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "No CI/CD pipeline" \
  --label "ci-cd,testing,high" \
  --body "**Priority:** HIGH

## Description
No automated testing, linting, or build verification on PRs/commits.

## Recommended Fix
Create \`.github/workflows/ci.yml\` with:
- Testing on multiple Node versions (16, 18, 20)
- Linting
- Build verification
- \`npm audit\` security checks

See REVIEW_ISSUES.md for full details."

# Medium Priority Issues
echo -e "\n${GREEN}Creating MEDIUM priority issues...${NC}"

gh issue create \
  --title "Missing JSDoc comments for public API" \
  --label "documentation,medium" \
  --body "**Priority:** MEDIUM

## Description
No JSDoc comments on public methods, making it impossible to:
- Generate API documentation with TypeDoc
- Get IntelliSense documentation in IDEs

## Recommended Fix
Add JSDoc to all public methods with param descriptions, return types, and examples.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "Missing CONTRIBUTING.md" \
  --label "documentation,medium" \
  --body "**Priority:** MEDIUM

## Description
README mentions 'Contributions are welcome' but provides no contribution guidelines.

## Recommended Fix
Create \`CONTRIBUTING.md\` with:
- Development setup
- Code style guide
- Testing requirements
- PR process
- Commit message format

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "Missing CHANGELOG.md" \
  --label "documentation,medium" \
  --body "**Priority:** MEDIUM

## Description
No changelog to track version history and breaking changes.

## Recommended Fix
Create \`CHANGELOG.md\` following Keep a Changelog format.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "API keys stored in plain text" \
  --label "security,documentation,medium" \
  --body "**Priority:** MEDIUM
**File:** \`src/config/index.ts\`

## Description
Config file stores API keys in plain text with no warning about file permissions.

## Recommended Fix
1. Add warning to README about file permissions
2. Automatically set \`chmod 600\` on config file
3. Warn if permissions are too permissive

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "Cache contains potentially sensitive data" \
  --label "security,documentation,medium" \
  --body "**Priority:** MEDIUM
**File:** \`src/cache/index.ts\`

## Description
Cached responses may contain sensitive terminal output with no encryption.

## Recommended Fix
Document cache security implications in README and provide cache clearing instructions.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "No dependency vulnerability scanning" \
  --label "security,ci-cd,medium" \
  --body "**Priority:** MEDIUM

## Description
No automated dependency vulnerability scanning.

## Recommended Fix
1. Run \`npm audit\` and fix issues
2. Add audit scripts to package.json
3. Add to CI/CD pipeline

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "Inefficient cache cleanup scales poorly" \
  --label "performance,medium" \
  --body "**Priority:** MEDIUM
**File:** \`src/cache/index.ts:96-124\`

## Description
The \`cleanExpired()\` reads and parses EVERY cache file, causing O(n) performance degradation.

## Recommended Fix
Use lazy cleanup on get/set operations or store expiry in filename.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "No interactive setup command" \
  --label "enhancement,ux,medium" \
  --body "**Priority:** MEDIUM

## Description
Users must manually set environment variables or edit JSON. Poor first-run experience.

## Recommended Fix
Add \`repair setup\` command with interactive configuration wizard.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "Missing NPM publishing metadata" \
  --label "packaging,distribution,medium" \
  --body "**Priority:** MEDIUM
**File:** \`package.json\`

## Description
Package is missing metadata needed for NPM publishing:
- No \`repository\` field
- No \`bugs\` field
- No \`homepage\` field
- No \`author\` name
- No \`.npmignore\`

## Recommended Fix
Update package.json with all required metadata and create .npmignore.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "main() function too long and complex" \
  --label "refactoring,code-quality,medium" \
  --body "**Priority:** MEDIUM
**File:** \`src/index.ts:15-178\`

## Description
The \`main()\` function is 163 lines handling 10 concerns, making it hard to test and maintain.

## Recommended Fix
Break into smaller, testable functions:
- \`validateEnvironment()\`
- \`loadEffectiveConfig()\`
- \`retrieveAndSanitize()\`
- \`analyzeWithCaching()\`

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "Using deprecated node-fetch@2" \
  --label "dependencies,technical-debt,medium" \
  --body "**Priority:** MEDIUM

## Description
Using \`node-fetch@2.7.0\` when Node 18+ has native fetch.

## Options
1. Bump minimum Node to 18 and use native fetch
2. Stay on Node 16 and document why

See REVIEW_ISSUES.md for full details."

# Low Priority Issues
echo -e "\n${GREEN}Creating LOW priority issues...${NC}"

gh issue create \
  --title "Unused --debug flag" \
  --label "code-quality,cli,low" \
  --body "**Priority:** LOW
**File:** \`src/cli.ts:16\`

## Description
The \`--debug\` flag is defined but provides no functionality beyond \`--verbose\`.

## Recommended Fix
Either implement actual debug logging or remove the flag.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "No shell integration for auto-run on errors" \
  --label "enhancement,ux,low" \
  --body "**Priority:** LOW

## Description
Users must manually run \`repair\` after each error.

## Recommended Fix
Provide shell hooks for Bash/Zsh to optionally auto-run repair on command failures.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "No update notification" \
  --label "enhancement,ux,low" \
  --body "**Priority:** LOW

## Description
No way for users to know when new versions are available.

## Recommended Fix
Add update checker using \`update-notifier\` package.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "No GitHub issue templates" \
  --label "documentation,github,low" \
  --body "**Priority:** LOW

## Description
No issue templates for bug reports, feature requests, etc.

## Recommended Fix
Create \`.github/ISSUE_TEMPLATE/\` with bug report and feature request templates.

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "Add preventive comment about command injection risk" \
  --label "security,code-quality,low" \
  --body "**Priority:** LOW (preventive)
**File:** \`src/zellij/index.ts:72\`

## Description
Current code is safe, but add warning comments to prevent future command injection issues.

## Recommended Fix
Add comment: \`// SECURITY: Never interpolate user input into shell commands\`

See REVIEW_ISSUES.md for full details."

gh issue create \
  --title "No request deduplication" \
  --label "enhancement,performance,low" \
  --body "**Priority:** LOW

## Description
Running \`repair\` multiple times quickly fires multiple identical API requests.

## Recommended Fix
Add in-flight request tracking to deduplicate concurrent identical requests.

See REVIEW_ISSUES.md for full details."

echo -e "\n${GREEN}✓ All issues created successfully!${NC}"
echo -e "\nView issues at: $(gh repo view --json url -q .url)/issues"
echo -e "\nSee REVIEW_ISSUES.md for complete details on all issues."
