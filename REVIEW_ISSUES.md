# Code Review Issues

This document contains all issues identified in the comprehensive code review. Each issue includes title, description, code references, and recommended fixes.

---

## 🚨 CRITICAL BUGS (Must Fix Before Any Release)

### Issue 1: `--no-cache` CLI flag is broken

**Priority:** CRITICAL
**Labels:** bug, cli, critical
**File:** `src/cli.ts:20`

**Description:**
The `--no-cache` command-line flag does not work correctly. Commander's `--no-cache` sets `options.cache` to `false`, but the code passes `options.cache` directly, which is `undefined` when the flag is not specified.

**Current Code:**
```typescript
await main({
  cacheEnabled: options.cache,  // BUG: undefined when flag not used
  confirmBeforeSend: options.confirm,
  verbose: options.verbose || options.debug,
});
```

**Impact:**
- Users cannot disable caching from the command line
- Default config setting for caching may be ignored

**Recommended Fix:**
```typescript
await main({
  cacheEnabled: options.cache !== false,
  confirmBeforeSend: options.confirm,
  verbose: options.verbose || options.debug,
});
```

---

### Issue 2: Regex race condition in security filter causes unpredictable behavior

**Priority:** CRITICAL
**Labels:** bug, security, critical
**File:** `src/security/index.ts:34-40`

**Description:**
The `detectSecrets()` method uses `.test()` on regex patterns with the `/g` flag, which causes stateful behavior. The `lastIndex` property persists between calls, leading to unpredictable results where the same input may return different results on repeated calls.

**Current Code:**
```typescript
detectSecrets(text: string): boolean {
  for (const pattern of this.secretPatterns) {
    if (pattern.test(text)) {  // Stateful regex with /g flag
      return true;
    }
  }
  return false;
}
```

**Impact:**
- Security checks may fail intermittently
- Same text may be redacted sometimes but not others
- Unreliable secret detection

**Recommended Fix:**
```typescript
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
```

Or use patterns without `/g` flag for testing.

---

### Issue 3: `truncateOutput()` method is never called, causing token limit errors

**Priority:** CRITICAL
**Labels:** bug, llm, critical
**File:** `src/llm/base.ts:79-103`

**Description:**
The `truncateOutput()` method is defined but never called by any LLM provider. This means long terminal outputs will be sent to LLM APIs without truncation, causing:
- Token limit exceeded errors
- Increased API costs
- Request failures

**Current Code:**
```typescript
protected truncateOutput(output: string, maxTokens: number = 2000): string {
  // Implementation exists but is never called
}

protected buildUserPrompt(request: AnalysisRequest): string {
  let prompt = `Command that was run:\n\`\`\`\n${request.command}\n\`\`\`\n\n`;
  prompt += `Output:\n\`\`\`\n${request.output}\n\`\`\`\n\n`;  // No truncation!
  // ...
}
```

**Recommended Fix:**
```typescript
protected buildUserPrompt(request: AnalysisRequest): string {
  let prompt = `Command that was run:\n\`\`\`\n${request.command}\n\`\`\`\n\n`;
  prompt += `Output:\n\`\`\`\n${this.truncateOutput(request.output)}\n\`\`\`\n\n`;
  // ...
}
```

---

### Issue 4: Missing timeout and retry logic for API requests

**Priority:** CRITICAL
**Labels:** bug, llm, error-handling, critical
**Files:** `src/llm/openai.ts:12-48`, `src/llm/anthropic.ts:12-46`

**Description:**
LLM API requests have no timeout or retry logic, causing:
- Indefinite hangs on network issues
- No recovery from transient failures
- Poor user experience with network problems
- Application crashes on network errors

**Current Code:**
```typescript
const response = await fetch(`${baseURL}/chat/completions`, {
  method: 'POST',
  headers: { /* ... */ },
  body: JSON.stringify({ /* ... */ }),
  // No timeout!
});
```

**Recommended Fix:**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

try {
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({ /* ... */ }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  // Add retry logic for 429, 500, 503 errors
} catch (error) {
  clearTimeout(timeoutId);
  if (error.name === 'AbortError') {
    throw new Error('API request timed out after 30 seconds');
  }
  throw error;
}
```

---

### Issue 5: Version comparison doesn't handle semantic versioning properly

**Priority:** HIGH
**Labels:** bug, zellij-integration
**File:** `src/zellij/index.ts:58-66`

**Description:**
The `compareVersions()` method has multiple issues:
- Assumes exactly 3 version parts (fails on `1.0` or `1.0.0.1`)
- Doesn't handle pre-release versions (`0.38.0-beta`)
- No validation for undefined parts
- Could cause ArrayIndexOutOfBounds-like issues

**Current Code:**
```typescript
private compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {  // Hardcoded 3
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
}
```

**Recommended Fix:**
Use the `semver` package:
```bash
npm install semver
npm install --save-dev @types/semver
```

```typescript
import semver from 'semver';

async checkVersion(minVersion: string = '0.38.0'): Promise<boolean> {
  try {
    const { stdout } = await execAsync('zellij --version');
    const match = stdout.match(/zellij\s+(\S+)/);
    if (!match) return false;

    const currentVersion = semver.coerce(match[1]);
    const requiredVersion = semver.coerce(minVersion);

    if (!currentVersion || !requiredVersion) return false;

    return semver.gte(currentVersion, requiredVersion);
  } catch {
    return false;
  }
}
```

---

## ⚠️ HIGH PRIORITY ISSUES

### Issue 6: Overly broad secret detection pattern causes false positives

**Priority:** HIGH
**Labels:** bug, security, false-positives
**File:** `src/security/index.ts:6`

**Description:**
The pattern `/\b[A-Za-z0-9]{32,}\b/g` matches ANY 32+ character alphanumeric string, causing massive false positives that redact legitimate error output:
- Git commit hashes (40 chars)
- Package checksums
- Docker image IDs
- UUIDs without dashes
- Base64 data in stack traces
- Hex strings in error messages

**Impact:**
Makes the tool unusable for many common errors where important diagnostic information is redacted.

**Example:**
```
Error: Package integrity check failed
Expected: sha512-a1b2c3d4e5f6...  [REDACTED]
```

**Recommended Fix:**
Remove this pattern entirely or make it much more specific:
```typescript
private secretPatterns: RegExp[] = [
  // Remove: /\b[A-Za-z0-9]{32,}\b/g,

  // Keep specific patterns only:
  /sk-[A-Za-z0-9]{32,}/g,    // OpenAI API keys
  /xoxb-[A-Za-z0-9-]+/g,     // Slack tokens
  // etc.
];
```

---

### Issue 7: Synchronous file operations block event loop

**Priority:** HIGH
**Labels:** performance, code-quality
**Files:** `src/config/index.ts:32,69`, `src/cache/index.ts:41,85`

**Description:**
Using synchronous file I/O (`fs.readFileSync`, `fs.writeFileSync`) blocks the Node.js event loop, causing:
- Poor performance
- Unresponsive application during file I/O
- Anti-pattern in Node.js

**Current Code:**
```typescript
const fileContent = fs.readFileSync(this.configPath, 'utf-8');
```

**Recommended Fix:**
```typescript
import { promises as fs } from 'fs';

async load(): Promise<Config> {
  // ...
  if (await fs.access(this.configPath).then(() => true).catch(() => false)) {
    try {
      const fileContent = await fs.readFile(this.configPath, 'utf-8');
      fileConfig = JSON.parse(fileContent);
    } catch (error) {
      console.warn(`Warning: Could not parse config file at ${this.configPath}`);
    }
  }
  // ...
}
```

---

### Issue 8: Weak type safety with `as any` casts

**Priority:** HIGH
**Labels:** code-quality, typescript
**Files:** `src/llm/openai.ts:40`, `src/llm/anthropic.ts:37`

**Description:**
Using `as any` defeats TypeScript's type safety and can lead to runtime errors when API response structures change.

**Current Code:**
```typescript
const data = await response.json() as any;
const content = data.choices[0]?.message?.content;  // No type checking
```

**Recommended Fix:**
```typescript
interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

const data = await response.json() as OpenAIResponse;
const content = data.choices[0]?.message?.content;
```

---

### Issue 9: Missing ESLint and Prettier configuration files

**Priority:** HIGH
**Labels:** tooling, code-quality
**Files:** Missing `.eslintrc.js`, `.prettierrc.json`

**Description:**
ESLint and Prettier are listed in `devDependencies` but have no configuration files. This means:
- `npm run lint` likely uses default/no rules
- `npm run format` uses default settings
- No consistent code style enforcement
- No automated code quality checks

**Recommended Fix:**
Create `.eslintrc.js`:
```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
```

Create `.prettierrc.json`:
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

---

## 🧪 TESTING ISSUES

### Issue 10: Insufficient test coverage (~5%)

**Priority:** HIGH
**Labels:** testing, quality-assurance

**Description:**
Only one test file exists (`src/config/index.test.ts`), providing ~5% code coverage. Critical functionality is untested:

**Missing Tests:**
- ❌ Zellij integration (command extraction, multi-line commands)
- ❌ LLM providers (all 5 providers)
- ❌ Security filter (secret detection, redaction)
- ❌ Cache manager (expiration, corruption recovery)
- ❌ Output formatter
- ❌ Integration tests (end-to-end)

**Impact:**
- High risk of regressions
- Unknown edge case behavior
- Difficult to refactor safely
- Low confidence in production readiness

**Recommended Fix:**
Target 70% coverage minimum. Priority test areas:
1. Zellij command extraction with various shell prompts
2. Security filter with known secrets and false positives
3. LLM provider error handling
4. Cache expiration and cleanup
5. End-to-end integration tests

Create test files:
- `src/zellij/index.test.ts`
- `src/security/index.test.ts`
- `src/llm/base.test.ts`
- `src/llm/openai.test.ts`
- `src/llm/anthropic.test.ts`
- `src/cache/index.test.ts`
- `src/output/index.test.ts`
- `tests/integration/e2e.test.ts`

---

### Issue 11: No test for regex race condition

**Priority:** HIGH
**Labels:** testing, security
**File:** Tests needed for `src/security/index.ts`

**Description:**
The regex race condition (Issue #2) needs a specific test to prevent regression.

**Recommended Test:**
```typescript
describe('SecurityFilter - regex state', () => {
  it('should consistently detect secrets on repeated calls', () => {
    const filter = new SecurityFilter();
    const textWithSecret = 'API key: sk-1234567890abcdefghijklmnopqrstuvwxyz';

    // Call multiple times - all should return true
    expect(filter.detectSecrets(textWithSecret)).toBe(true);
    expect(filter.detectSecrets(textWithSecret)).toBe(true);
    expect(filter.detectSecrets(textWithSecret)).toBe(true);

    const textWithoutSecret = 'No secrets here';
    expect(filter.detectSecrets(textWithoutSecret)).toBe(false);
    expect(filter.detectSecrets(textWithoutSecret)).toBe(false);
  });
});
```

---

## 📚 DOCUMENTATION ISSUES

### Issue 12: Missing JSDoc comments for public API

**Priority:** MEDIUM
**Labels:** documentation
**Files:** All source files

**Description:**
No JSDoc comments on public methods, making it impossible to:
- Generate API documentation with TypeDoc
- Understand method contracts without reading implementation
- Get IntelliSense documentation in IDEs

**Recommended Fix:**
Add JSDoc to all public methods:
```typescript
/**
 * Analyzes a terminal error using the configured LLM provider.
 *
 * @param request - The command and output to analyze
 * @returns Promise resolving to explanation and suggested fixes
 * @throws {Error} If API request fails or response is invalid
 *
 * @example
 * ```typescript
 * const response = await provider.analyze({
 *   command: 'npm install',
 *   output: 'Error: Cannot find module...'
 * });
 * ```
 */
abstract analyze(request: AnalysisRequest): Promise<AnalysisResponse>;
```

---

### Issue 13: Missing CONTRIBUTING.md

**Priority:** MEDIUM
**Labels:** documentation

**Description:**
README mentions "Contributions are welcome" but provides no contribution guidelines:
- No code style requirements
- No testing requirements
- No PR process
- No development setup details
- No commit message conventions

**Recommended Fix:**
Create `CONTRIBUTING.md` with:
- Development setup instructions
- Code style guide (link to ESLint config)
- Testing requirements (coverage threshold)
- PR process and checklist
- Commit message format (conventional commits?)
- Code of conduct

---

### Issue 14: Missing CHANGELOG.md

**Priority:** MEDIUM
**Labels:** documentation

**Description:**
No changelog to track version history, breaking changes, and release notes.

**Recommended Fix:**
Create `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial implementation of LLM-driven error analysis
- Support for OpenAI, Anthropic, Google, OpenRouter, and local models

## [0.1.0] - 2024-XX-XX

### Added
- Initial release
```

---

## 🔒 SECURITY ISSUES

### Issue 15: API keys stored in plain text in config file

**Priority:** MEDIUM
**Labels:** security, documentation
**File:** `src/config/index.ts`

**Description:**
The config file at `~/.config/repair/config.json` stores API keys in plain text with no warning about file permissions.

**Security Risks:**
- API keys readable by any process with user privileges
- Keys may be backed up to cloud services
- No protection if system is compromised

**Recommended Fix:**
1. Add warning to README about file permissions
2. Automatically set `chmod 600` on config file when created
3. Add warning if permissions are too permissive

```typescript
async save(config: Partial<Config>): Promise<void> {
  // ... existing code ...
  fs.writeFileSync(this.configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');

  // Set restrictive permissions
  fs.chmodSync(this.configPath, 0o600);
}
```

Add to README:
```markdown
## Security Note

API keys are stored in `~/.config/repair/config.json`. Ensure this file has
restrictive permissions:

```bash
chmod 600 ~/.config/repair/config.json
```
```

---

### Issue 16: Cache contains potentially sensitive data

**Priority:** MEDIUM
**Labels:** security, documentation
**File:** `src/cache/index.ts`

**Description:**
Cached responses at `~/.cache/repair/` may contain:
- Redacted but still sensitive terminal output
- File paths revealing system structure
- Command history
- No cache encryption

**Recommended Fix:**
Document in README:
```markdown
## Cache Security

Cached responses are stored unencrypted in `~/.cache/repair/`. While secrets
are redacted, cached data may still contain:
- Command history
- File system paths
- Error messages with sensitive context

To clear the cache:
```bash
rm -rf ~/.cache/repair/
```

To disable caching:
```bash
export REPAIR_CACHE_ENABLED=false
# or use --no-cache flag
repair --no-cache
```
```

---

### Issue 17: No dependency vulnerability scanning

**Priority:** MEDIUM
**Labels:** security, ci-cd

**Description:**
No automated dependency vulnerability scanning. Current dependencies should be audited:
- `node-fetch@2.7.0` - check for CVEs
- No `npm audit` in development workflow
- No automated security checks

**Recommended Fix:**
1. Run `npm audit` now and fix issues
2. Add to package.json scripts:
```json
"scripts": {
  "audit": "npm audit",
  "audit:fix": "npm audit fix"
}
```
3. Add to CI/CD pipeline (Issue #22)

---

### Issue 18: Command injection risk if user input added to shell commands

**Priority:** LOW (preventive)
**Labels:** security, code-quality
**File:** `src/zellij/index.ts:72`

**Description:**
Current code is safe, but future developers might add user input to shell commands. No warnings in code about this risk.

**Current Code:**
```typescript
const { stdout } = await execAsync('zellij action dump-screen -');  // Currently safe
```

**Recommended Fix:**
Add warning comment:
```typescript
// SECURITY: Never interpolate user input into these commands
// Use shell escaping or parameterized commands if needed
const { stdout } = await execAsync('zellij action dump-screen -');
```

---

## ⚡ PERFORMANCE ISSUES

### Issue 19: Inefficient cache cleanup scales poorly

**Priority:** MEDIUM
**Labels:** performance
**File:** `src/cache/index.ts:96-124`

**Description:**
The `cleanExpired()` method reads and parses EVERY cache file on each call, causing:
- O(n) performance that degrades with cache size
- Multi-second delays with 1000+ cached entries
- Wasted I/O and CPU

**Current Code:**
```typescript
async cleanExpired(): Promise<void> {
  const files = fs.readdirSync(this.cacheDir);  // Loads all files
  for (const file of files) {
    // Reads and parses EVERY file
    const content = fs.readFileSync(filePath, 'utf-8');
    const entry: CacheEntry = JSON.parse(content);
    // ...
  }
}
```

**Recommended Fix:**
Option 1: Lazy cleanup on get/set
```typescript
async get(command: string, output: string): Promise<AnalysisResponse | null> {
  // ... existing code ...

  // Check expiry when reading
  if (now - entry.timestamp > this.ttl) {
    fs.unlinkSync(cachePath);  // Clean up this one file
    return null;
  }

  return entry.response;
}
```

Option 2: Store expiry in filename
```typescript
private getCachePath(key: string): string {
  const expiryTime = Date.now() + this.ttl;
  return path.join(this.cacheDir, `${key}-${expiryTime}.json`);
}
```

---

### Issue 20: No request deduplication

**Priority:** LOW
**Labels:** enhancement, performance
**File:** `src/index.ts`

**Description:**
If a user runs `repair` multiple times quickly before cache is written, multiple identical API requests fire, causing:
- Wasted API credits
- Unnecessary latency
- Race conditions in cache writing

**Recommended Fix:**
Add in-flight request tracking:
```typescript
const inFlightRequests = new Map<string, Promise<AnalysisResponse>>();

async function analyzeWithDedup(request: AnalysisRequest): Promise<AnalysisResponse> {
  const key = getCacheKey(request.command, request.output);

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key)!;
  }

  const promise = llmProvider.analyze(request);
  inFlightRequests.set(key, promise);

  try {
    const result = await promise;
    return result;
  } finally {
    inFlightRequests.delete(key);
  }
}
```

---

## 🚀 MISSING FEATURES

### Issue 21: No interactive setup command

**Priority:** MEDIUM
**Labels:** enhancement, ux

**Description:**
Users must manually set environment variables or edit JSON config. Poor first-run experience.

**Recommended Fix:**
Add `repair setup` command:
```typescript
program
  .command('setup')
  .description('Interactive configuration wizard')
  .action(async () => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const provider = await question(rl, 'Select LLM provider (openai/anthropic/google/openrouter/local): ');
    const apiKey = await question(rl, 'Enter API key: ');
    const model = await question(rl, 'Model (optional, press Enter for default): ');

    const config = { provider, apiKey, ...(model && { model }) };
    await configManager.save(config);

    console.log('✓ Configuration saved to ~/.config/repair/config.json');
    rl.close();
  });
```

---

### Issue 22: No CI/CD pipeline

**Priority:** HIGH
**Labels:** ci-cd, testing

**Description:**
No automated testing, linting, or build verification on PRs/commits. Increases risk of breaking changes.

**Recommended Fix:**
Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [16.x, 18.x, 20.x]

    steps:
    - uses: actions/checkout@v3
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
    - run: npm ci
    - run: npm run lint
    - run: npm run build
    - run: npm test
    - run: npm audit
```

---

### Issue 23: Missing NPM publishing metadata

**Priority:** MEDIUM
**Labels:** packaging, distribution
**File:** `package.json`

**Description:**
README mentions `npm install -g repair` but package isn't published and is missing metadata:
- No `repository` field
- No `bugs` field
- No `homepage` field
- No `author` name
- No `.npmignore` file
- Version stuck at `0.1.0`

**Recommended Fix:**
Update `package.json`:
```json
{
  "name": "repair",
  "version": "0.1.0",
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/rvforest/repair.git"
  },
  "bugs": {
    "url": "https://github.com/rvforest/repair/issues"
  },
  "homepage": "https://github.com/rvforest/repair#readme",
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ]
}
```

Create `.npmignore`:
```
src/
*.test.ts
tsconfig.json
.github/
openspec/
.claude/
```

---

### Issue 24: Unused `--debug` flag

**Priority:** LOW
**Labels:** code-quality, cli
**File:** `src/cli.ts:16`

**Description:**
The `--debug` flag is defined but provides no functionality beyond `--verbose`. Either implement or remove.

**Current Code:**
```typescript
.option('--debug', 'Enable debug output')
.action(async (options) => {
  await main({
    verbose: options.verbose || options.debug,  // Same as verbose
  });
});
```

**Recommended Fix:**
Option 1: Implement debug mode with additional logging
```typescript
// Add debug parameter to main()
export async function main(options: MainOptions & { debug?: boolean }): Promise<void> {
  if (options.debug) {
    console.log('[DEBUG] Starting analysis...');
    console.log('[DEBUG] Config:', effectiveConfig);
    console.log('[DEBUG] Raw output:', analysisRequest);
  }
}
```

Option 2: Remove the flag if not needed

---

### Issue 25: No shell integration for auto-run on errors

**Priority:** LOW
**Labels:** enhancement, ux

**Description:**
Users must manually run `repair` after each error. Could provide shell hooks for automatic analysis.

**Recommended Fix:**
Add to README:
```markdown
## Shell Integration (Optional)

### Bash/Zsh
Add to `~/.bashrc` or `~/.zshrc`:
```bash
repair_on_error() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo "Command failed with exit code $exit_code"
    read -p "Run repair? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      repair
    fi
  fi
  return $exit_code
}

# Add to prompt command
PROMPT_COMMAND="repair_on_error; $PROMPT_COMMAND"
```
```

---

### Issue 26: No update notification

**Priority:** LOW
**Labels:** enhancement, ux

**Description:**
No way for users to know when new versions are available.

**Recommended Fix:**
Add update checker using `update-notifier` package:
```bash
npm install update-notifier
```

```typescript
import updateNotifier from 'update-notifier';
import pkg from '../package.json';

updateNotifier({ pkg }).notify();
```

---

## 🔧 DEPENDENCY ISSUES

### Issue 27: Using deprecated `node-fetch@2`

**Priority:** MEDIUM
**Labels:** dependencies, technical-debt
**Files:** `package.json`, all LLM providers

**Description:**
Using `node-fetch@2.7.0` (CommonJS) when:
- Node.js 18+ has native `fetch`
- `node-fetch@3` is ESM-only (breaking change)
- Current minimum is Node 16, which doesn't have native fetch

**Recommended Fix:**
Option 1: Bump minimum Node version to 18 and use native fetch
```json
"engines": {
  "node": ">=18.0.0"
}
```

Remove dependency:
```bash
npm uninstall node-fetch @types/node-fetch
```

Update imports:
```typescript
// Remove: import fetch from 'node-fetch';
// Use native fetch (globally available in Node 18+)
```

Option 2: Stay on Node 16 and keep `node-fetch@2`
- Add comment explaining why
- Monitor for security issues

---

### Issue 28: Missing type definitions

**Priority:** LOW
**Labels:** typescript, dependencies

**Description:**
Missing some type definitions that could improve type safety.

**Recommended Fix:**
```bash
npm install --save-dev @types/node@latest
```

Ensure all dependencies have types or `@types/*` packages.

---

## 📋 CODE ORGANIZATION

### Issue 29: `main()` function too long and complex

**Priority:** MEDIUM
**Labels:** refactoring, code-quality
**File:** `src/index.ts:15-178`

**Description:**
The `main()` function is 163 lines and handles 10 different concerns, making it:
- Hard to test
- Hard to understand
- Hard to modify
- Violates Single Responsibility Principle

**Recommended Fix:**
Break into smaller, testable functions:
```typescript
async function validateEnvironment(): Promise<ZellijInfo> {
  const zellijIntegration = new ZellijIntegration();
  const zellijInfo = await zellijIntegration.detectZellij();
  // Steps 1-2
  return zellijInfo;
}

async function loadEffectiveConfig(options: MainOptions): Promise<Config> {
  const configManager = new ConfigManager();
  const config = await configManager.load();
  // Step 3
  return effectiveConfig;
}

async function retrieveAndSanitize(
  config: Config,
  formatter: OutputFormatter,
  options: MainOptions
): Promise<AnalysisRequest> {
  // Steps 4-6
}

async function analyzeWithCaching(
  request: AnalysisRequest,
  config: Config,
  formatter: OutputFormatter,
  options: MainOptions
): Promise<AnalysisResponse> {
  // Steps 7-9
}

export async function main(options: MainOptions = {}): Promise<void> {
  const formatter = new OutputFormatter();

  try {
    const zellijInfo = await validateEnvironment();
    const config = await loadEffectiveConfig(options);
    const request = await retrieveAndSanitize(config, formatter, options);
    const response = await analyzeWithCaching(request, config, formatter, options);

    console.log('\n' + formatter.formatResponse(response));
  } catch (error) {
    handleError(error, formatter);
    throw error;
  }
}
```

---

## 🎯 QUALITY OF LIFE

### Issue 30: No GitHub issue templates

**Priority:** LOW
**Labels:** documentation, github

**Description:**
No issue templates make it harder for users to report bugs or request features with necessary information.

**Recommended Fix:**
Create `.github/ISSUE_TEMPLATE/bug_report.md`:
```markdown
---
name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: bug
assignees: ''
---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Run command '...'
2. See error '...'
3. Run `repair`
4. See issue

**Expected behavior**
What you expected to happen.

**Environment:**
 - OS: [e.g. macOS 13.0, Ubuntu 22.04]
 - Node version: [e.g. 18.0.0]
 - Zellij version: [e.g. 0.39.2]
 - repAIr version: [e.g. 0.1.0]
 - LLM provider: [e.g. openai, anthropic]

**Additional context**
Add any other context about the problem here.
```

Create feature request and question templates similarly.

---

## Summary

**Total Issues: 30**

**By Priority:**
- 🚨 Critical: 5
- ⚠️ High: 10
- 📋 Medium: 11
- 💡 Low: 4

**By Category:**
- Bugs: 11
- Testing: 2
- Documentation: 3
- Security: 4
- Performance: 2
- Missing Features: 5
- Code Quality: 3

**Estimated Effort:**
- Critical fixes: 1-2 days
- High priority: 2-3 days
- Medium priority: 3-4 days
- Total: 1-2 weeks for production ready v0.5

