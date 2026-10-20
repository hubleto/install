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

export default {
  entry: {
    main: [
      './src/Main',
      ...communityApps,
      ...enterpriseApps,
      ...externalApps,
      ...customApps
    ],
  },
  output: {
    path: path.resolve(__dirname, 'assets/compiled/js'),
    filename: '[name].js',
    clean: true
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
    splitChunks: {
      cacheGroups: {
        community_apps: {
          minSize: 0,
          enforce: true,
          test: /[\\/]erp[\\/]apps[\\/]/,
          name(module) {
            const identifier = module.identifier();
            const app = /[\\/]erp[\\/]apps[\\/](.*?)[\\/]/.exec(identifier)[1];
            return `community/${app}`;
          },
          chunks: 'all'
        },
        enterprise_apps: {
          minSize: 0,
          enforce: true,
          test: /[\\/]enterprise[\\/]apps[\\/]/,
          name(module) {
            const identifier = module.identifier();
            const app = /[\\/]enterprise[\\/]apps[\\/](.*?)[\\/]/.exec(identifier)[1];
            console.log('module enterprise', identifier, app);
            return `enterprise/${app}`;
          },
          chunks: 'all'
        },
        external_apps: {
          minSize: 0,
          enforce: true,
          test: /[\\/]src[\\/]Components/,
          name(module) {
            const composerJsonFile = path.resolve(module.context, '..', '..') + '/composer.json';
            const composer = JSON.parse(fs.readFileSync(composerJsonFile));
            const psr4 = composer.autoload['psr-4'];
            const namespace = Object.keys(psr4)[0]
              .replaceAll('\\', '/')
              .replace('Hubleto/App/External/', '')
              .replace(/\/$/g, '')
            ;

            console.log('module external', composer, psr4, namespace);
            return `external/${namespace}`;
          },
          chunks: 'all'
        },
        custom_apps: {
          minSize: 0,
          enforce: true,
          test: /[\\/]src[\\/]apps[\\/]/,
          name(module) {
            const identifier = module.identifier();
            const app = /[\\/]src[\\/]apps[\\/](.*?)[\\/]/.exec(identifier)[1];
            return `custom/${app}`;
          },
          chunks: 'all'
        },
        react_ui: {
          test: /[\\/]react-ui[\\/]/,
          name: 'react-ui',
          chunks: 'all'
        },
        external_apps: {
          test: /[\\/]vendor[\\/]/,
          name: 'external-apps',
          chunks: 'all'
        },
        modules: {
          test: /[\\/]node_modules[\\/]/,
          name: 'modules',
          chunks: 'all'
        }
      }
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
