import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '../..');
const repositoryRoot = path.resolve(frontendRoot, '../..');
const frontendBuildRoot = path.join(frontendRoot, 'dist', 'converter-ui');
const browserBuildDirectory = path.join(frontendBuildRoot, 'browser');
const fallbackBuildDirectory = frontendBuildRoot;
const backendWwwrootDirectory = path.join(repositoryRoot, 'backend', 'ConverterApi', 'wwwroot');

const sourceDirectory = fs.existsSync(browserBuildDirectory)
  ? browserBuildDirectory
  : fallbackBuildDirectory;

if (!fs.existsSync(sourceDirectory)) {
  throw new Error(
    `Angular build output could not be found. Expected "${browserBuildDirectory}" or "${fallbackBuildDirectory}".`
  );
}

fs.rmSync(backendWwwrootDirectory, { recursive: true, force: true });
fs.mkdirSync(backendWwwrootDirectory, { recursive: true });
fs.cpSync(sourceDirectory, backendWwwrootDirectory, { recursive: true });

console.log(`Frontend files copied to ${backendWwwrootDirectory}`);
