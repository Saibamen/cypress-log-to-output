const CDP = require('chrome-remote-interface')
const chalk = require('chalk')

let eventFilter
let recordLogs
let displayFilter

/**
 * @typedef {Object} LogEntry
 * @property {'browser'|'console'} type - Type of log entry
 * @property {string} level - Severity level (error, warning, info, verbose)
 * @property {string} [source] - Source of the log (e.g., 'network', 'javascript') - only for browser logs
 * @property {string} message - Formatted log message
 * @property {number} timestamp - Timestamp of the log
 */

/** @type {LogEntry[]} */
let messageLog = [];

const severityColors = {
  'verbose': (a) => a,
  'info': chalk.blue,
  'warning': chalk.yellow,
  'error': chalk.red
}

const severityIcons = {
  'verbose': ' ',
  'info': '🛈',
  'warning': '⚠',
  'error': '⚠',
}

function debugLog(msg) {
  // suppress with DEBUG=-cypress-log-to-output
  if (process.env.DEBUG && process.env.DEBUG.includes('-cypress-log-to-output')) {
    return
  }

  log(`[cypress-log-to-output] ${msg}`)
}

function log(msg) {
  console.log(msg)
}

function logEntry(params) {
  if (eventFilter && !eventFilter('browser', params.entry)) {
    return
  }

  const { level, source, text, timestamp, url, lineNumber, stackTrace, args } = params.entry
  const color = severityColors[level]
  const icon = severityIcons[level]

  const prefix = `[${new Date(timestamp).toISOString()}] ${icon} `
  const prefixSpacer = ' '.repeat(prefix.length)

  let logMessage = `${prefix}${chalk.bold(level)} (${source}): ${text}`;

  const shouldDisplay = !displayFilter || displayFilter('browser', params.entry);
  if (shouldDisplay) {
    log(color(logMessage));
  }

  // Build additional message parts
  const additionalParts = [];
  if (url) {
    additionalParts.push(`${prefixSpacer}${chalk.bold('URL')}: ${url}`);
  }
  if (stackTrace && lineNumber) {
    additionalParts.push(`${prefixSpacer}Stack trace line number: ${lineNumber}`);
    additionalParts.push(`${prefixSpacer}Stack trace description: ${stackTrace.description}`);
    additionalParts.push(`${prefixSpacer}Stack call frames: ${stackTrace.callFrames.join(', ')}`);
  }
  if (args) {
    additionalParts.push(`${prefixSpacer}Arguments:`);
    additionalParts.push(`${prefixSpacer}  ` + JSON.stringify(args, null, 2).split('\n').join(`\n${prefixSpacer}  `).trimRight());
  }

  // Display additional parts
  if (shouldDisplay) {
    additionalParts.forEach(part => log(color(part)));
  }

  // Record structured log entry
  const fullMessage = [logMessage, ...additionalParts].join('\n');
  recordLogEntry({
    type: 'browser',
    level,
    source,
    message: fullMessage,
    timestamp
  });
}

function logConsole(params) {
  if (eventFilter && !eventFilter('console', params)) {
    return
  }

  const { type, args, timestamp } = params
  const level = type === 'error' ? 'error' : 'verbose'
  const color = severityColors[level]
  const icon = severityIcons[level]

  const prefix = `[${new Date(timestamp).toISOString()}] ${icon} `
  const prefixSpacer = ' '.repeat(prefix.length)

  let logMessage = `${prefix}${chalk.bold(`console.${type}`)} called`;

  const shouldDisplay = !displayFilter || displayFilter('console', params);
  if (shouldDisplay) {
    log(color(logMessage));
  }

  // Build additional message parts
  const additionalParts = [];
  if (args) {
    additionalParts.push(`${prefixSpacer}Arguments:`);
    additionalParts.push(`${prefixSpacer}  ` + JSON.stringify(args, null, 2).split('\n').join(`\n${prefixSpacer}  `).trimRight());
  }

  // Display additional parts
  if (shouldDisplay) {
    additionalParts.forEach(part => log(color(part)));
  }

  // Record structured log entry
  const fullMessage = [logMessage, ...additionalParts].join('\n');
  recordLogEntry({
    type: 'console',
    level,
    source: 'console',
    message: fullMessage,
    timestamp
  });
}

function install(on, filter, options = {}) {
  eventFilter = filter;
  recordLogs = options.recordLogs;
  displayFilter = options.displayFilter;
  on('before:browser:launch', browserLaunchHandler)
}

/**
 * Records a structured log entry
 * @param {LogEntry} entry
 */
function recordLogEntry(entry) {
  if (recordLogs) {
    messageLog.push(entry);
  }
}

/**
 * Returns all recorded log entries with level and source for filtering
 * @returns {LogEntry[]}
 */
function getLogs() {
  return messageLog;
}

function clearLogs() {
  messageLog = [];
}

function isChrome(browser) {
  return browser.family === 'chrome' || ['chrome', 'chromium', 'canary'].includes(browser.name) || (browser.family === 'chromium' && browser.name !== 'electron')
}

function ensureRdpPort(args) {
  const existing = args.find(arg => arg.slice(0, 23) === '--remote-debugging-port')

  if (existing) {
    return Number(existing.split('=')[1])
  }

  const port = 40000 + Math.round(Math.random() * 25000)

  args.push(`--remote-debugging-port=${port}`)

  return port
}

function browserLaunchHandler(browser = {}, launchOptions) {
  const args = launchOptions.args || launchOptions

  if (!isChrome(browser)) {
    return debugLog(`Warning: An unsupported browser family was used, output will not be logged to console: ${browser.family}`)
  }

  const rdp = ensureRdpPort(args)

  debugLog('Attempting to connect to Chrome Debugging Protocol')

  const tryConnect = () => {
    new CDP({
      port: rdp
    })
    .then((cdp) => {
      debugLog('Connected to Chrome Debugging Protocol')

      /** captures logs from the browser */
      cdp.Log.enable()
      cdp.Log.entryAdded(logEntry)

      /** captures logs from console.X calls */
      cdp.Runtime.enable()
      cdp.Runtime.consoleAPICalled(logConsole)

      cdp.on('disconnect', () => {
        debugLog('Chrome Debugging Protocol disconnected')
      })
    })
    .catch(() => {
      setTimeout(tryConnect, 100)
    })
  }

  tryConnect()

  return launchOptions
}

module.exports = {
  _ensureRdpPort: ensureRdpPort,
  install,
  browserLaunchHandler,
  getLogs,
  clearLogs
}
