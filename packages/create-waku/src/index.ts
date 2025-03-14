#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { default as prompts } from 'prompts';
import { red, green, bold } from 'kolorist';
import fse from 'fs-extra/esm';

function isValidPackageName(projectName: string) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
    projectName,
  );
}

function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z0-9-~]+/g, '-');
}

// if the dir is empty or not exist
function canSafelyOverwrite(dir: string) {
  return !existsSync(dir) || readdirSync(dir).length === 0;
}

async function notifyUpdate() {
  const nodeRequire = createRequire(import.meta.url);
  // `update-check` is a CSJ module.
  const checkForUpdate = nodeRequire('update-check');
  const packageJson = nodeRequire('../package.json');
  const result = await checkForUpdate(packageJson).catch(() => null);
  if (result?.latest) {
    console.log(`A new version of 'create-waku' is available!`);
    console.log('You can update by running: ');
    console.log();
    console.log(`    npm i -g create-waku`);
  }
}

async function init() {
  let targetDir = '';
  const defaultProjectName = 'waku-project';
  const templateRoot = path.join(
    fileURLToPath(import.meta.url),
    '../../template',
  );
  // maybe include `.DS_Store` on macOS
  const CHOICES = (await fsPromises.readdir(templateRoot)).filter(
    (dir) => !dir.startsWith('.'),
  );
  let result: {
    packageName: string;
    shouldOverwrite: string;
    chooseProject: string;
  };

  try {
    result = await prompts(
      [
        {
          name: 'projectName',
          type: 'text',
          message: 'Project Name',
          initial: defaultProjectName,
          onState: (state: any) =>
            (targetDir = String(state.value).trim() || defaultProjectName),
        },
        {
          name: 'shouldOverwrite',
          type: () => (canSafelyOverwrite(targetDir) ? null : 'confirm'),
          message: `${targetDir} is not empty. Remove existing files and continue?`,
        },
        {
          name: 'overwriteChecker',
          type: (values: any) => {
            if (values === false) {
              throw new Error(red('✖') + ' Operation cancelled');
            }
            return null;
          },
        },
        {
          name: 'packageName',
          type: () => (isValidPackageName(targetDir) ? null : 'text'),
          message: 'Package name',
          initial: () => toValidPackageName(targetDir),
          validate: (dir: string) =>
            isValidPackageName(dir) || 'Invalid package.json name',
        },
        {
          name: 'chooseProject',
          type: 'select',
          message: 'Choose a starter template',
          choices: [
            { title: 'basic-template', value: CHOICES[0] },
            { title: 'async-template', value: CHOICES[1] },
            { title: 'promise-template', value: CHOICES[2] },
            { title: 'callserver-template', value: CHOICES[3] },
            { title: 'mutation-template', value: CHOICES[4] },
            { title: 'nesting-template', value: CHOICES[5] },
            { title: 'router-template', value: CHOICES[6] },
          ],
        },
      ],
      {
        onCancel: () => {
          throw new Error(red('✖') + ' Operation cancelled');
        },
      },
    );
  } catch (cancelled) {
    if (cancelled instanceof Error) {
      console.log(cancelled.message);
    }
    process.exit(1);
  }

  const { packageName, shouldOverwrite, chooseProject } = result;

  const root = path.resolve(targetDir);

  if (shouldOverwrite) {
    fse.emptyDirSync(root);
  } else if (!existsSync(root)) {
    await fsPromises.mkdir(root, { recursive: true });
  }

  const pkg = {
    name: packageName ?? toValidPackageName(targetDir),
    version: '0.0.0',
  };

  console.log('Setting up project...');

  const templateDir = path.join(templateRoot, chooseProject);

  // Read existing package.json from the root directory
  const packageJsonPath = path.join(root, 'package.json');

  // Read new package.json from the template directory
  const newPackageJsonPath = path.join(templateDir, 'package.json');
  const newPackageJson = JSON.parse(
    await fsPromises.readFile(newPackageJsonPath, 'utf-8'),
  );

  fse.copySync(templateDir, root);

  await fsPromises.writeFile(
    packageJsonPath,
    JSON.stringify(
      {
        ...newPackageJson,
        ...pkg,
      },
      null,
      2,
    ),
  );

  const manager = process.env.npm_config_user_agent ?? '';
  const packageManager = /pnpm/.test(manager)
    ? 'pnpm'
    : /yarn/.test(manager)
      ? 'yarn'
      : 'npm';

  const commandsMap = {
    install: {
      pnpm: 'pnpm install',
      yarn: 'yarn',
      npm: 'npm install',
    },
    dev: {
      pnpm: 'pnpm dev',
      yarn: 'yarn dev',
      npm: 'npm run dev',
    },
  };

  console.log(`\nDone. Now run:\n`);
  console.log(`${bold(green(`cd ${targetDir}`))}`);
  console.log(`${bold(green(commandsMap.install[packageManager]))}`);
  console.log(`${bold(green(commandsMap.dev[packageManager]))}`);
  console.log();
}

init()
  .then(notifyUpdate)
  .catch((e) => {
    console.error(e);
  });
