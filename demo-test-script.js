#!/usr/bin/env node

/**
 * GitMate Demo Test Script
 * 
 * This script validates all commands that will be demonstrated in the promotional video.
 * Run this before recording to ensure everything works smoothly.
 */

import { aiService } from './src/services/aiServiceFactory.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

// Test configuration
const TEST_CONFIG = {
  testRepoName: 'gitmate-demo-test',
  testBranchName: 'feature-demo-test',
  delayBetweenTests: 2000, // 2 seconds
  verbose: true
};

// Demo commands to test
const DEMO_COMMANDS = [
  // Setup & Authentication
  {
    category: 'Setup',
    command: 'gitmate init',
    type: 'system',
    description: 'Initialize GitMate configuration',
    expected: 'success'
  },
  {
    category: 'Authentication',
    command: 'gitmate auth github',
    type: 'system',
    description: 'Authenticate with GitHub',
    expected: 'success',
    skipIf: () => process.env.GITHUB_TOKEN // Skip if already authenticated
  },
  {
    category: 'Authentication',
    command: 'gitmate whoami',
    type: 'system',
    description: 'Verify user authentication',
    expected: 'success'
  },
  
  // Repository Management
  {
    category: 'Repository',
    command: 'gitmate "list all of my repos"',
    type: 'nlp',
    description: 'List GitHub repositories using natural language',
    expected: 'list_repos'
  },
  {
    category: 'Repository',
    command: 'gitmate "create new repository demo-project"',
    type: 'nlp',
    description: 'Create new repository using natural language',
    expected: 'create_repo',
    cleanup: () => cleanupTestRepo('demo-project')
  },
  
  // Git Operations
  {
    category: 'Git Operations',
    command: 'gitmate "show status"',
    type: 'nlp',
    description: 'Check Git status using natural language',
    expected: 'git_status'
  },
  {
    category: 'Git Operations',
    command: 'gitmate "create a new branch called feature-login"',
    type: 'nlp',
    description: 'Create new branch using natural language',
    expected: 'create_branch'
  },
  {
    category: 'Git Operations',
    command: 'gitmate "commit with message \'add user authentication\'"',
    type: 'nlp',
    description: 'Commit changes with message using natural language',
    expected: 'git_commit'
  },
  {
    category: 'Git Operations',
    command: 'gitmate "push my changes"',
    type: 'nlp',
    description: 'Push changes using natural language',
    expected: 'push_changes'
  },
  
  // AI Features
  {
    category: 'AI Features',
    command: 'gitmate generate-commit-message',
    type: 'system',
    description: 'Generate commit message using AI',
    expected: 'success'
  },
  {
    category: 'AI Features',
    command: 'gitmate generate-gitignore "React TypeScript project with Vite"',
    type: 'system',
    description: 'Generate .gitignore using AI',
    expected: 'success'
  },
  
  // Advanced Workflow
  {
    category: 'Workflow',
    command: 'gitmate "create merge request from feature-login to main"',
    type: 'nlp',
    description: 'Create pull request using natural language',
    expected: 'create_pr'
  },
  
  // Traditional Commands (for comparison)
  {
    category: 'Traditional',
    command: 'gitmate git status',
    type: 'system',
    description: 'Traditional Git status command',
    expected: 'success'
  },
  {
    category: 'Traditional',
    command: 'gitmate repo list',
    type: 'system',
    description: 'Traditional repository listing command',
    expected: 'success'
  }
];

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = `[${timestamp}]`;
  
  switch (type) {
    case 'success':
      console.log(chalk.green(`${prefix} ✅ ${message}`));
      break;
    case 'error':
      console.log(chalk.red(`${prefix} ❌ ${message}`));
      break;
    case 'warning':
      console.log(chalk.yellow(`${prefix} ⚠️  ${message}`));
      break;
    case 'info':
      console.log(chalk.blue(`${prefix} ℹ️  ${message}`));
      break;
    default:
      console.log(`${prefix} ${message}`);
  }
}

function logSection(title) {
  console.log('\n' + chalk.cyan('='.repeat(60)));
  console.log(chalk.cyan(`  ${title}`));
  console.log(chalk.cyan('='.repeat(60)));
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeCommand(command, description) {
  try {
    log(`Executing: ${description}`, 'info');
    if (TEST_CONFIG.verbose) {
      console.log(chalk.gray(`  Command: ${command}`));
    }
    
    const output = execSync(command, { 
      encoding: 'utf8',
      stdio: TEST_CONFIG.verbose ? 'inherit' : 'pipe'
    });
    
    log(`Success: ${description}`, 'success');
    return { success: true, output };
  } catch (error) {
    log(`Error: ${description} - ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

async function testNLPCommand(command, expectedIntent) {
  try {
    log(`Testing NLP: ${command}`, 'info');
    if (TEST_CONFIG.verbose) {
      console.log(chalk.gray(`  Expected Intent: ${expectedIntent}`));
    }
    
    const result = await aiService.parseIntent(command);
    
    if (result.intent === expectedIntent) {
      log(`NLP Success: ${command} → ${result.intent}`, 'success');
      return { success: true, intent: result.intent, confidence: result.confidence };
    } else {
      log(`NLP Mismatch: Expected ${expectedIntent}, got ${result.intent}`, 'warning');
      return { success: false, expected: expectedIntent, actual: result.intent, confidence: result.confidence };
    }
  } catch (error) {
    log(`NLP Error: ${command} - ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

async function cleanupTestRepo(repoName) {
  try {
    log(`Cleaning up test repository: ${repoName}`, 'info');
    // This would need to be implemented based on your GitHub API setup
    // For now, just log the cleanup intention
    log(`Cleanup logged for: ${repoName}`, 'warning');
  } catch (error) {
    log(`Cleanup failed for ${repoName}: ${error.message}`, 'error');
  }
}

async function runDemoTests() {
  logSection('GitMate Demo Test Suite');
  log('Starting comprehensive test of all demo commands...', 'info');
  
  const results = {
    total: DEMO_COMMANDS.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    categories: {}
  };
  
  for (let i = 0; i < DEMO_COMMANDS.length; i++) {
    const test = DEMO_COMMANDS[i];
    
    // Initialize category tracking
    if (!results.categories[test.category]) {
      results.categories[test.category] = { passed: 0, failed: 0, skipped: 0 };
    }
    
    logSection(`Test ${i + 1}/${DEMO_COMMANDS.length}: ${test.category} - ${test.description}`);
    
    // Check if test should be skipped
    if (test.skipIf && test.skipIf()) {
      log(`Skipping test: ${test.description}`, 'warning');
      results.skipped++;
      results.categories[test.category].skipped++;
      continue;
    }
    
    let testResult;
    
    if (test.type === 'nlp') {
      testResult = await testNLPCommand(test.command, test.expected);
    } else {
      testResult = await executeCommand(test.command, test.description);
    }
    
    if (testResult.success) {
      results.passed++;
      results.categories[test.category].passed++;
    } else {
      results.failed++;
      results.categories[test.category].failed++;
    }
    
    // Cleanup if specified
    if (test.cleanup && testResult.success) {
      await test.cleanup();
    }
    
    // Delay between tests
    if (i < DEMO_COMMANDS.length - 1) {
      await delay(TEST_CONFIG.delayBetweenTests);
    }
  }
  
  return results;
}

function printResults(results) {
  logSection('Test Results Summary');
  
  console.log(chalk.white(`\n📊 Overall Results:`));
  console.log(chalk.green(`  ✅ Passed: ${results.passed}`));
  console.log(chalk.red(`  ❌ Failed: ${results.failed}`));
  console.log(chalk.yellow(`  ⏭️  Skipped: ${results.skipped}`));
  console.log(chalk.blue(`  📈 Success Rate: ${((results.passed / (results.total - results.skipped)) * 100).toFixed(1)}%`));
  
  console.log(chalk.white(`\n📋 Category Breakdown:`));
  Object.entries(results.categories).forEach(([category, stats]) => {
    const total = stats.passed + stats.failed + stats.skipped;
    const successRate = total > 0 ? ((stats.passed / (total - stats.skipped)) * 100).toFixed(1) : '0.0';
    
    console.log(chalk.cyan(`  ${category}:`));
    console.log(`    ✅ Passed: ${stats.passed}`);
    console.log(`    ❌ Failed: ${stats.failed}`);
    console.log(`    ⏭️  Skipped: ${stats.skipped}`);
    console.log(`    📈 Success Rate: ${successRate}%`);
  });
  
  // Recommendations
  console.log(chalk.white(`\n💡 Recommendations:`));
  if (results.failed === 0) {
    console.log(chalk.green('  🎉 All tests passed! Ready for video recording.'));
  } else {
    console.log(chalk.yellow('  ⚠️  Some tests failed. Review and fix before recording.'));
    console.log(chalk.blue('  🔧 Check error messages above for specific issues.'));
  }
  
  if (results.skipped > 0) {
    console.log(chalk.blue('  ℹ️  Some tests were skipped (likely due to existing configuration).'));
  }
}

async function main() {
  try {
    console.log(chalk.cyan('🚀 GitMate Demo Test Script'));
    console.log(chalk.gray('Validating all commands for promotional video...\n'));
    
    const results = await runDemoTests();
    printResults(results);
    
    // Exit with appropriate code
    process.exitCode = results.failed > 0 ? 1 : 0;
    
  } catch (error) {
    log(`Test suite failed: ${error.message}`, 'error');
    console.error(error.stack);
    process.exitCode = 1;
  }
}

// Run the test suite
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runDemoTests, DEMO_COMMANDS }; 