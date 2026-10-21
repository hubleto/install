import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logCyan = (s) => console.log('\x1b[36m%s\x1b[0m', s);
const logYellow = (s) => console.log('\x1b[33m%s\x1b[0m', s);
const logGreen = (s) => console.log('\x1b[32m%s\x1b[0m', s);
const logRed = (s) => console.log('\x1b[31m%s\x1b[0m', s);

function findHubletoAppsInRepository(folder) {
  let apps = [];
  if (fs.existsSync(folder) && fs.lstatSync(folder).isDirectory()) {
    fs.readdirSync(folder).forEach(function(app) {
      const stat = fs.statSync(folder + '/' + app);
      const manifestFile = folder + '/' + app + '/manifest.yaml';
      const loaderEntry = folder + '/' + app + '/Loader';

      if (
        stat
        && stat.isDirectory()
        && fs.existsSync(manifestFile)
        && fs.existsSync(loaderEntry + '.tsx')
      ) {
        apps.push(loaderEntry);
      }
    });
  }

  return apps;
}

let communityApps = findHubletoAppsInRepository(path.resolve(__dirname, 'vendor/hubleto/erp/apps'))
let enterpriseApps = findHubletoAppsInRepository(path.resolve(__dirname, 'vendor/hubleto/enterprise/apps'))
let customApps = findHubletoAppsInRepository(path.resolve(__dirname, 'src/apps'))

let externalApps = [];

const vendorFolder = path.resolve(__dirname, 'vendor');
if (fs.existsSync(vendorFolder) && fs.lstatSync(vendorFolder).isDirectory()) {
  fs.readdirSync(vendorFolder).forEach(function(vendor) {
    if (vendor === 'hubleto') return;

    const vendorVendorFolder = path.resolve(vendorFolder, vendor);

    if (fs.existsSync(vendorVendorFolder) && fs.lstatSync(vendorVendorFolder).isDirectory()) {
      fs.readdirSync(vendorVendorFolder).forEach(function(app) {
        const appFolder = path.resolve(vendorVendorFolder, app, 'src');
        if (fs.existsSync(appFolder) && fs.lstatSync(appFolder).isDirectory()) {
          const manifestFile = appFolder + '/manifest.yaml';
          const loaderEntry = appFolder + '/Loader';

          if (fs.existsSync(manifestFile) && fs.existsSync(loaderEntry + '.tsx')) {
            externalApps.push(loaderEntry);
          }
        }
      });
    }
  });
}

logYellow(
    'Found ' + communityApps.length + ' community, '
    + enterpriseApps.length + ' enterprise, '
    + externalApps.length + ' external and '
    + customApps.length + ' custom apps.'
);

// ===== entries =====

let entries = {
  main: '../hubleto/src/assets/src/Main.tsx',
};

communityApps.map((app) => {
  const appName = /\/(.*?)\/Loader/.exec(app)[1];
  entries['community/' + appName] = { import: app, dependOn: 'main' };
})

enterpriseApps.map((app) => {
  const appName = /\/(.*?)\/Loader/.exec(app)[1];
  entries['enterprise/' + appName] = { import: app, dependOn: 'main' };
})

externalApps.map((app) => {
  const composerJsonFile = path.resolve(app, '..', '..') + '/composer.json';
  const composer = JSON.parse(fs.readFileSync(composerJsonFile));
  const psr4 = composer.autoload['psr-4'];
  const appName = Object.keys(psr4)[0]
    .replaceAll('\\', '/')
    .replace('Hubleto/App/External/', '')
    .replace(/\/$/g, '')
  ;
  entries['external/' + appName] = { import: app, dependOn: 'main' };
})

// ===== outputPath =====
const outputPath = path.resolve(__dirname, 'assets/compiled/js');

// ===== modules =====
const modules = [
  path.resolve(__dirname, './node_modules'),
];

// ===== aliases =====
const aliases = {
  '@babel/runtime': path.resolve(__dirname, 'node_modules/@babel/runtime'),
  '@hubleto/react-ui': path.resolve(__dirname, 'node_modules/@hubleto/react-ui'),
  '@hubleto/apps': path.resolve(__dirname, 'vendor/hubleto/erp/apps'),
}

export function init() { return { entries, outputPath, aliases, modules } };