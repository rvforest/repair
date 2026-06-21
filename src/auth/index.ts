import { Command } from 'commander';
import * as readline from 'readline';
import { ConfigManager } from '../config';
import {
  CredentialError,
  CredentialResolver,
  CredentialResolverLike,
  CredentialStore,
  createCredentialStore,
  validateRemoteProvider,
} from '../credentials';
import { LLMProvider } from '../types';

export interface AuthDependencies {
  configManager?: Pick<ConfigManager, 'load'>;
  store?: CredentialStore;
  storeFactory?: () => CredentialStore;
  resolver?: CredentialResolverLike;
  promptSecret?: (message: string) => Promise<string>;
  promptConfirm?: (message: string) => Promise<boolean>;
  stdout?: Pick<NodeJS.WriteStream, 'write'>;
}

export interface MaskedPromptDependencies {
  stdin?: NodeJS.ReadStream;
  stdout?: Pick<NodeJS.WriteStream, 'write' | 'isTTY'>;
  signalTarget?: Pick<NodeJS.Process, 'once' | 'off'>;
  terminate?: (signal: NodeJS.Signals) => void;
}

export function registerAuthCommands(program: Command, dependencies: AuthDependencies = {}): void {
  const auth = program.command('auth').description('Manage secure API credentials');

  auth
    .command('set [provider]')
    .description('Store a provider credential in the platform secure store')
    .allowExcessArguments(false)
    .option('--force', 'Replace an existing credential without confirmation')
    .action(async (provider: string | undefined, options: { force?: boolean }) => {
      await runAuthAction(() => setCredential(provider, options.force === true, dependencies));
    });

  auth
    .command('status [provider]')
    .description('Show credential availability and effective source')
    .allowExcessArguments(false)
    .action(async (provider: string | undefined) => {
      await runAuthAction(() => showCredentialStatus(provider, dependencies));
    });

  auth
    .command('remove [provider]')
    .description('Remove a provider credential from the platform secure store')
    .allowExcessArguments(false)
    .action(async (provider: string | undefined) => {
      await runAuthAction(() => removeCredential(provider, dependencies));
    });
}

export async function setCredential(
  providerArgument: string | undefined,
  force: boolean,
  dependencies: AuthDependencies = {},
): Promise<void> {
  const provider = await resolveProvider(providerArgument, dependencies);
  const store = resolveStore(dependencies);
  const output = dependencies.stdout || process.stdout;
  await store.preflight();

  if (await store.exists(provider)) {
    if (!force) {
      const confirm = dependencies.promptConfirm || promptConfirmation;
      if (!(await confirm(`Credential for ${provider} exists. Replace it? [y/N] `))) {
        output.write('Credential was not changed.\n');
        return;
      }
    }
  }

  const prompt = dependencies.promptSecret || promptMasked;
  const value = await prompt(`API credential for ${provider}: `);
  if (!value) {
    throw new Error('Credential cannot be empty.');
  }
  await store.set(provider, value);
  output.write(`Stored credential for ${provider} in ${store.backend.displayName}.\n`);
}

export async function showCredentialStatus(
  providerArgument: string | undefined,
  dependencies: AuthDependencies = {},
): Promise<void> {
  const provider = await resolveProvider(providerArgument, dependencies);
  const store = resolveStore(dependencies);
  const resolver = dependencies.resolver || new CredentialResolver(store);
  const output = dependencies.stdout || process.stdout;
  const status = await resolver.status(provider);

  if (status.source === 'env') {
    output.write(`${provider}: ${status.source} ${status.maskedValue}\n`);
    return;
  }
  if (status.source === 'secure-store') {
    output.write(`${provider}: secure-store (${status.backend?.displayName || store.backend.displayName})\n`);
    return;
  }
  if (status.source === 'missing') {
    output.write(`${provider}: missing\n`);
    return;
  }
  output.write(
    `${provider}: unavailable (${status.backend?.displayName || store.backend.displayName}; ${
      status.errorCode || 'backend-failure'
    })\n`,
  );
}

export async function removeCredential(
  providerArgument: string | undefined,
  dependencies: AuthDependencies = {},
): Promise<void> {
  const provider = await resolveProvider(providerArgument, dependencies);
  const store = resolveStore(dependencies);
  const output = dependencies.stdout || process.stdout;
  const removed = await store.remove(provider);
  output.write(
    removed
      ? `Removed credential for ${provider} from ${store.backend.displayName}.\n`
      : `No stored credential found for ${provider}.\n`,
  );
}

export async function promptMasked(message: string, dependencies: MaskedPromptDependencies = {}): Promise<string> {
  const stdin = dependencies.stdin || process.stdin;
  const stdout = dependencies.stdout || process.stdout;
  const signalTarget = dependencies.signalTarget || process;
  const terminate =
    dependencies.terminate ||
    ((signal: NodeJS.Signals) => {
      process.kill(process.pid, signal);
    });

  if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode) {
    throw new Error('Credential input requires an interactive terminal.');
  }

  stdout.write(message);
  const previousRaw = stdin.isRaw;
  const wasPaused = stdin.isPaused();
  try {
    stdin.setRawMode(true);
    stdin.resume();
  } catch (error) {
    try {
      stdin.setRawMode(Boolean(previousRaw));
    } catch {}
    throw error;
  }

  return new Promise<string>((resolve, reject) => {
    let value = '';
    let settled = false;
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    const cleanup = () => {
      if (settled) return;
      settled = true;
      stdin.off('data', onData);
      stdin.off('error', onError);
      stdin.off('end', onEnd);
      for (const signal of signals) signalTarget.off(signal, signalHandlers[signal]);
      try {
        stdin.setRawMode(Boolean(previousRaw));
      } catch {}
      try {
        if (wasPaused) stdin.pause();
      } catch {}
      try {
        stdout.write('\n');
      } catch {}
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onError = () => fail(new Error('Credential input failed.'));
    const onEnd = () => fail(new Error('Credential input ended before a credential was entered.'));
    const signalHandlers = Object.fromEntries(
      signals.map((signal) => [
        signal,
        () => {
          fail(new Error('Credential entry cancelled.'));
          terminate(signal);
        },
      ]),
    ) as Record<NodeJS.Signals, () => void>;
    const succeed = () => {
      cleanup();
      resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 3 || byte === 4) {
          fail(new Error('Credential entry cancelled.'));
          return;
        }
        if (byte === 13 || byte === 10) {
          succeed();
          return;
        }
        if (byte === 8 || byte === 127) {
          value = value.slice(0, -1);
          continue;
        }
        if (byte >= 32) value += String.fromCharCode(byte);
      }
    };
    stdin.on('data', onData);
    stdin.once('error', onError);
    stdin.once('end', onEnd);
    for (const signal of signals) signalTarget.once(signal, signalHandlers[signal]);
  });
}

export async function promptConfirmation(message: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Overwrite confirmation requires an interactive terminal; use --force.');
  }
  const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise<boolean>((resolve) => {
    reader.question(message, (answer) => {
      reader.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function resolveProvider(
  providerArgument: string | undefined,
  dependencies: AuthDependencies,
): Promise<LLMProvider> {
  if (providerArgument) return validateRemoteProvider(providerArgument);
  const manager = dependencies.configManager || new ConfigManager();
  const config = await manager.load({ requireApiKey: false });
  if (config.provider === 'local') {
    throw new Error('Local providers do not use stored API credentials.');
  }
  return validateRemoteProvider(config.provider);
}

function resolveStore(dependencies: AuthDependencies): CredentialStore {
  return dependencies.store || (dependencies.storeFactory || createCredentialStore)();
}

async function runAuthAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof CredentialError) {
      console.error(`Error: ${error.message}\nSet REPAIR_API_KEY if secure storage is unavailable.`);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    process.exitCode = 1;
  }
}
