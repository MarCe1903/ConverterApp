import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '../..');
const repositoryRoot = path.resolve(frontendRoot, '../..');
const backendProjectPath = path.join(repositoryRoot, 'backend', 'ConverterApi', 'ConverterApi.csproj');
const publishDirectory = path.join(frontendRoot, 'electron', 'backend-publish');
const runtimeIdentifier = getRuntimeIdentifier();

await fs.promises.rm(publishDirectory, { recursive: true, force: true });
await fs.promises.mkdir(publishDirectory, { recursive: true });

await runCommand('dotnet', [
  'publish',
  backendProjectPath,
  '--configuration',
  'Release',
  '--runtime',
  runtimeIdentifier,
  '--self-contained',
  'true',
  '--output',
  publishDirectory
], repositoryRoot);

const executableName = process.platform === 'win32'
  ? 'ConverterApi.exe'
  : 'ConverterApi';
const executablePath = path.join(publishDirectory, executableName);

if (!fs.existsSync(executablePath)) {
  throw new Error(`Published backend executable was not found at "${executablePath}".`);
}

console.log(`Backend published to ${publishDirectory}`);

function getRuntimeIdentifier() {
  if (process.platform === 'win32') {
    return process.arch === 'arm64'
      ? 'win-arm64'
      : 'win-x64';
  }

  if (process.platform === 'darwin') {
    return process.arch === 'arm64'
      ? 'osx-arm64'
      : 'osx-x64';
  }

  if (process.platform === 'linux') {
    return process.arch === 'arm64'
      ? 'linux-arm64'
      : 'linux-x64';
  }

  throw new Error(`Unsupported publish platform: ${process.platform}/${process.arch}`);
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      windowsHide: true
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
}
