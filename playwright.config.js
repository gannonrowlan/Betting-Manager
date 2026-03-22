const fs = require('fs');
const path = require('path');

const { defineConfig } = require('@playwright/test');

function findBrowserPath() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

const executablePath = findBrowserPath();

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4010',
    headless: true,
    trace: 'on-first-retry',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'node scripts/startTestServer.js',
    url: 'http://127.0.0.1:4010/readyz',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
