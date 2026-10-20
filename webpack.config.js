// const path = require('path');
// const fs = require('fs');

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

console.log('Found ' + communityApps.length + ' community apps.');
console.log('Found ' + enterpriseApps.length + ' enterprise apps.');
console.log('Found ' + externalApps.length + ' external apps.');
console.log('Found ' + customApps.length + ' custom apps.');

let appEntries = {};

communityApps.map((app) => {
  const appName = /\/(.*?)\/Loader/.exec(app)[1];
  appEntries['community/' + appName] = { import: app, dependOn: 'main' };
})

enterpriseApps.map((app) => {
  const appName = /\/(.*?)\/Loader/.exec(app)[1];
  appEntries['enterprise/' + appName] = { import: app, dependOn: 'main' };
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
  appEntries['external/' + appName] = { import: app, dependOn: 'main' };
})

export default {
  entry: {
    main: '../hubleto/src/assets/src/Main.tsx',
    ...appEntries,
  },
  output: {
    path: path.resolve(__dirname, 'assets/compiled/js'),
    publicPath: '/assets/',
    filename: '[name].js',
    chunkFilename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.(js|mjs|jsx|ts|tsx)$/,
        use: 'babel-loader',
      },
      {
        test: /\.(scss|css)$/,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      }
    ],
  },
  optimization: {
    runtimeChunk: 'single',            // one shared runtime, no duplicate bootstraps
    splitChunks: {
      // delete your per-app cacheGroups; keep only shared code
      cacheGroups: {
        modules: { test: /[\\/]node_modules[\\/]/, name: 'modules', chunks: 'all', enforce: true },
        reactUi: { test: /[\\/]hubleto[\\/]src[\\/]react-ui[\\/]/, name: 'react-ui', chunks: 'all', enforce: true },
      },
    },
  },
  resolve: {
    modules: [
      path.resolve(__dirname, './node_modules'),
    ],
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.scss', '.css'],
    alias: {
      '@babel/runtime': path.resolve(__dirname, 'node_modules/@babel/runtime'),
      '@hubleto/react-ui': path.resolve(__dirname, 'node_modules/@hubleto/react-ui'),
      '@hubleto/apps': path.resolve(__dirname, 'vendor/hubleto/erp/apps'),
    },
  }
};