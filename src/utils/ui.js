import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import inquirer from 'inquirer';
import gradient from 'gradient-string';
import wrapAnsi from 'wrap-ansi';
import terminalLink from 'terminal-link';
import logSymbols from 'log-symbols';
import cliSpinners from 'cli-spinners';
import { homedir } from 'os';


// Environment configuration
const IS_CI = process.env.CI === 'true';
const IS_TTY = process.stdout.isTTY;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MAX_WIDTH = Math.min(80, process.stdout.columns || 80);

// Enhanced color schemes with fallbacks for CI environments
const colors = {
  primary: IS_CI ? chalk.blue : gradient.pastel,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,
  muted: chalk.gray.dim,
  white: chalk.white,
  bold: chalk.bold,
  highlight: chalk.bgBlue.white
};

// Animation configuration
const SPINNER_CONFIG = {
  interval: 80,
  frames: cliSpinners.dots.frames
};

// UI Component Library
class ProfessionalUI {
  constructor() {
    this._spinner = null;
    this._lastMessageType = null;
    this._interactive = IS_TTY && !IS_CI;
  }

  // ======================
  // Core Display Methods
  // ======================

  /**
   * Display application header with version info
   */
  header(title = 'GitMate', version = '') {
    if (!this._interactive) return;

    const titleLine = ` ${title} ${version ? colors.muted(`v${version}`) : ''} `;
    const headerWidth = Math.min(MAX_WIDTH, titleLine.length + 8);
    
    console.log(
      boxen(
        colors.primary(titleLine), 
        {
          padding: 1,
          margin: { top: 1, bottom: 0 },
          borderStyle: 'round',
          borderColor: 'blue',
          float: 'center',
          width: headerWidth
        }
      )
    );
  }

  /**
   * Display section header with optional description
   */
  section(title, description = '') {
    const content = [
      colors.bold.blue(title.toUpperCase()),
      ...(description ? [colors.muted(this._wrapText(description))] : [])
    ].join('\n');

    console.log(
      boxen(content, {
        padding: { top: 1, bottom: 1, left: 2, right: 2 },
        margin: { top: 1, bottom: 1 },
        borderStyle: 'round',
        borderColor: 'blue',
        float: 'center',
        width: MAX_WIDTH
      })
    );
  }

  progress(message) {
    // Simple progress indicator (can be improved with spinners later)
    console.log(`⏳ ${message}`);
  }

  // ======================
  // Message Components
  // ======================

  /**
   * Display success message with optional details
   */
  success(message, details = '') {
    this._logMessage(
      `${logSymbols.success} ${colors.bold(message)}`,
      details,
      { borderColor: 'green' }
    );
  }

  /**
   * Display error message with optional stack trace
   */
  error(message, errorObj = null) {
    let details = '';
    if (errorObj) {
      details = NODE_ENV === 'development' 
        ? errorObj.stack 
        : errorObj.message;
      
      // Shorten file paths for readability (only if details is a string)
      if (typeof details === 'string') {
        details = details.replace(new RegExp(homedir(), 'g'), '~');
        details = details.replace(new RegExp(process.cwd(), 'g'), '.');
      }
    }

    this._logMessage(
      `${logSymbols.error} ${colors.bold(message)}`,
      details,
      { borderColor: 'red' }
    );
  }

  /**
   * Display warning message
   */
  warning(message, details = '') {
    this._logMessage(
      `${logSymbols.warning} ${colors.bold(message)}`,
      details,
      { borderColor: 'yellow' }
    );
  }

  /**
   * Display informational message
   */
  info(message, details = '') {
    this._logMessage(
      `${logSymbols.info} ${colors.bold(message)}`,
      details,
      { borderColor: 'cyan' }
    );
  }

  // ======================
  // Interactive Components
  // ======================

  /**
   * Display a confirmation prompt
   */
  async confirm(message, defaultValue = false) {
    if (!this._interactive) return defaultValue;

    const { confirmed } = await inquirer.prompt({
      type: 'confirm',
      name: 'confirmed',
      message: this._formatQuestion(message),
      default: defaultValue,
      prefix: colors.cyan('?')
    });

    return confirmed;
  }

  /**
   * Display a text input prompt
   */
  async input(message, options = {}) {
    if (!this._interactive) return options.default || '';

    const { value } = await inquirer.prompt({
      type: 'input',
      name: 'value',
      message: this._formatQuestion(message),
      default: options.default,
      validate: options.validate,
      prefix: colors.cyan('?'),
      transformer: (input, { isFinal }) => {
        if (options.password) return '*'.repeat(input.length);
        return isFinal ? colors.primary(input) : input;
      }
    });

    return value;
  }

  /**
   * Display a selection list
   */
  async select(message, choices, options = {}) {
    if (!this._interactive) return options.default || choices[0].value;

    const { selection } = await inquirer.prompt({
      type: 'list',
      name: 'selection',
      message: this._formatQuestion(message),
      choices: choices,
      default: options.default,
      prefix: colors.cyan('?'),
      pageSize: Math.min(10, choices.length)
    });

    return selection;
  }

  /**
   * Display a checkbox selection
   */
  async checkbox(message, choices, options = {}) {
    if (!this._interactive) return options.default || [];

    const { selections } = await inquirer.prompt({
      type: 'checkbox',
      name: 'selections',
      message: this._formatQuestion(message),
      choices: choices,
      default: options.default,
      prefix: colors.cyan('?'),
      pageSize: Math.min(10, choices.length)
    });

    return selections;
  }

  // ======================
  // Progress Indicators
  // ======================

  /**
   * Start a spinner with text
   */
  startSpinner(text) {
    if (!this._interactive) {
      console.log(colors.cyan(`> ${text}...`));
      return;
    }

    if (this._spinner) this._spinner.stop();
    this._spinner = ora({
      text: colors.cyan(text),
      color: 'cyan',
      spinner: SPINNER_CONFIG,
      isEnabled: this._interactive
    }).start();
  }

  /**
   * Update spinner text
   */
  updateSpinner(text) {
    if (this._spinner) {
      this._spinner.text = colors.cyan(text);
    }
  }

  /**
   * Stop spinner with success state
   */
  succeedSpinner(text) {
    if (this._spinner) {
      this._spinner.succeed(colors.green(text));
      this._spinner = null;
    } else {
      this.success(text);
    }
  }

  /**
   * Stop spinner with failure state
   */
  failSpinner(text) {
    if (this._spinner) {
      this._spinner.fail(colors.red(text));
      this._spinner = null;
    } else {
      this.error(text);
    }
  }

  /**
   * Stop spinner without changing state
   */
  stopSpinner() {
    if (this._spinner) {
      this._spinner.stop();
      this._spinner = null;
    }
  }

  // ======================
  // Data Display Components
  // ======================

  /**
   * Display data in a table format
   */
  table(data, options = {}) {
    if (!data || data.length === 0) {
      this.info('No data to display');
      return;
    }

    // Remove duplicates by Name
    const uniqueData = [];
    const seenNames = new Set();
    for (const row of data) {
      if (!seenNames.has(row.Name)) {
        uniqueData.push(row);
        seenNames.add(row.Name);
      }
    }

    // Enhance Type with icons and color
    uniqueData.forEach(row => {
      if (row.Type) {
        if (row.Type.toLowerCase().includes('private')) {
          row.Type = `${chalk.yellow('🔒 Private')}`;
        } else {
          row.Type = `${chalk.green('🌐 Public')}`;
        }
      }
      // Format date
      if (row.Updated) {
        row.Updated = new Date(row.Updated).toLocaleDateString();
      }
      // Make URL clickable and colored
      if (row.URL) {
        let displayUrl = row.URL;
        if (displayUrl.length > 40) {
          displayUrl = displayUrl.slice(0, 37) + '...';
        }
        if (terminalLink.isSupported) {
          row.URL = terminalLink(chalk.cyan(displayUrl), row.URL);
        } else {
          row.URL = chalk.cyan(displayUrl);
        }
      }
    });

    const headers = options.headers || Object.keys(uniqueData[0]);
    const columnWidths = headers.map(header => {
      const headerLength = header.length;
      const maxDataLength = Math.max(...uniqueData.map(row => 
        String(row[header] || '').replace(/\u001b\[[0-9;]*m/g, '').length
      ));
      return Math.min(
        Math.max(headerLength, maxDataLength, 12),
        Math.floor(MAX_WIDTH / headers.length)
      );
    });

    // Build header row
    const headerRow = headers
      .map((header, i) => chalk.blue.bold(header.padEnd(columnWidths[i])))
      .join(' │ ');

    // Build divider
    const divider = '─'.repeat(
      headerRow.length + (headers.length - 1) * 3
    );

    // Print table
    console.log(chalk.blue(`┌${divider}┐`));
    console.log(chalk.blue(`│ ${headerRow} │`));
    console.log(chalk.blue(`├${divider}┤`));

    uniqueData.forEach(row => {
      const rowText = headers
        .map((header, i) => {
          let cell = String(row[header] || '');
          // Pad cell, but avoid breaking color codes
          const plainCell = cell.replace(/\u001b\[[0-9;]*m/g, '');
          const padLength = Math.max(columnWidths[i] - plainCell.length, 0);
          return cell + ' '.repeat(padLength);
        })
        .join(' │ ');
      console.log(chalk.white(`│ ${rowText} │`));
    });

    console.log(chalk.blue(`└${divider}┘`));
  }

  /**
   * Display key-value pairs
   */
  keyValue(pairs, options = {}) {
    const maxKeyLength = Math.max(
      ...Object.keys(pairs).map(k => k.length)
    );

    Object.entries(pairs).forEach(([key, value]) => {
      const formattedKey = colors.bold.blue(
        `${key}:`.padEnd(maxKeyLength + 2)
      );
      console.log(`${formattedKey} ${this._formatValue(value, options)}`);
    });
  }

  /**
   * Display a horizontal divider
   */
  divider(label = '') {
    const line = '─'.repeat(MAX_WIDTH);
    if (label) {
      const paddedLabel = ` ${label} `;
      const padding = Math.floor((MAX_WIDTH - paddedLabel.length) / 2);
      console.log(
        colors.muted(
          '─'.repeat(padding) + paddedLabel + '─'.repeat(padding)
        )
      );
    } else {
      console.log(colors.muted(line));
    }
  }

  // ======================
  // Advanced Components
  // ======================

  /**
   * Display a link (if terminal supports it)
   */
  link(text, url) {
    if (terminalLink.isSupported) {
      return terminalLink(text, url, {
        fallback: (text, url) => `${text} (${url})`
      });
    }
    return `${text}: ${url}`;
  }

  /**
   * Display a progress bar
   */
  progressBar(current, total, options = {}) {
    if (!this._interactive) return;

    const width = options.width || 30;
    const complete = Math.min(
      Math.floor((current / total) * width),
      width
    );
    const incomplete = width - complete;
    
    const bar = [
      colors.green('█'.repeat(complete)),
      colors.gray('░'.repeat(incomplete))
    ].join('');

    const percentage = Math.floor((current / total) * 100);
    const text = options.text || `${current}/${total}`;

    if (this._spinner) {
      this._spinner.text = `${bar} ${percentage}% | ${text}`;
    } else {
      process.stdout.write(
        `\r${bar} ${percentage}% | ${text}` + 
        (current === total ? '\n' : '')
      );
    }
  }

  /**
   * Display a command help section
   */
  help(commands) {
    this.section('Available Commands');
    
    commands.forEach(cmd => {
      console.log(colors.cyan(`  ${cmd.name.padEnd(20)}`) + 
                 colors.white(cmd.description));
      
      if (cmd.usage) {
        console.log(colors.muted(`    Usage: ${cmd.usage}`));
      }
      
      if (cmd.examples && cmd.examples.length > 0) {
        console.log(colors.muted('    Examples:'));
        cmd.examples.forEach(ex => {
          console.log(colors.muted(`      ${ex}`));
        });
      }
      
      console.log('');
    });
  }

  // ======================
  // Utility Methods
  // ======================

  /**
   * Clear the console (development only)
   */
  clear() {
    if (this._interactive && NODE_ENV === 'development') {
      console.clear();
    }
  }

  /**
   * Wrap text to terminal width
   */
  _wrapText(text, width = MAX_WIDTH - 10) {
    return wrapAnsi(text, width, { trim: true });
  }

  /**
   * Format a value for display
   */
  _formatValue(value, options = {}) {
    if (value === undefined || value === null) {
      return colors.muted('undefined');
    }
    
    if (typeof value === 'boolean') {
      return value ? colors.green('true') : colors.red('false');
    }
    
    if (typeof value === 'number') {
      return colors.cyan(value.toString());
    }
    
    if (Array.isArray(value)) {
      return value.map(v => this._formatValue(v)).join(', ');
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    
    if (options.password) {
      return '*'.repeat(value.length);
    }
    
    return value;
  }

  /**
   * Format a question for inquirer
   */
  _formatQuestion(message) {
    return colors.white(message.endsWith('?') ? message : `${message}?`);
  }

  /**
   * Internal method for consistent message logging
   */
  _logMessage(title, details = '', options = {}) {
    // Skip duplicate error messages
    if (this._lastMessageType === 'error' && options.type === 'error') {
      return;
    }
    this._lastMessageType = options.type || 'info';

    // Build message content
    let content = title;
    if (details) {
      content += `\n\n${this._wrapText(colors.muted(details))}`;
    }

    // Print message
    console.log(
      boxen(content, {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: 'round',
        borderColor: options.borderColor || 'cyan',
        float: 'center',
        width: MAX_WIDTH
      })
    );
  }
}

// Export the class for use in other modules
export { ProfessionalUI };

// Singleton instance
const UI = new ProfessionalUI();

export default UI;