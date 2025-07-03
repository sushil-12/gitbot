import { aiService } from './src/services/aiServiceFactory.js';
import fs from 'fs';
import path from 'path';

// Complete GitHub workflow test scenarios
const workflowTests = [
  {
    name: "Repository Creation Workflow",
    description: "Create a new repository and verify it's created",
    commands: [
      "Create a new repository called test-workflow-repo",
      "Make a repo named my-test-project",
      "Initialize a fresh GitHub repo titled workflow-demo"
    ],
    expectedIntents: ["create_repo", "create_repo", "create_repo"]
  },
  {
    name: "Repository Listing & Discovery",
    description: "List and discover repositories",
    commands: [
      "List all my GitHub repositories",
      "Show my repositories",
      "What repositories do I have?",
      "Display all my repos"
    ],
    expectedIntents: ["list_repos", "list_repos", "list_repos", "list_repos"]
  },
  {
    name: "Git Status & Changes Workflow",
    description: "Check status and view changes",
    commands: [
      "Show me the current status",
      "What's changed in my repository?",
      "Show me the differences",
      "Display the git status"
    ],
    expectedIntents: ["git_status", "git_status", "git_diff", "git_status"]
  },
  {
    name: "Branch Management Workflow",
    description: "Create, list, and switch branches",
    commands: [
      "List all branches",
      "Show my branches",
      "Create a new branch called feature-login",
      "Switch to the main branch",
      "Checkout the develop branch"
    ],
    expectedIntents: ["list_branches", "list_branches", "create_branch", "checkout_branch", "checkout_branch"]
  },
  {
    name: "Commit & Push Workflow",
    description: "Stage, commit, and push changes",
    commands: [
      "Stage all my changes",
      "Add all files to staging",
      "Commit with message 'Add login functionality'",
      "Push my changes to GitHub",
      "Commit and push all changes"
    ],
    expectedIntents: ["git_add", "git_add", "git_commit", "push_changes", "push_changes"]
  },
  {
    name: "Pull & Sync Workflow",
    description: "Pull latest changes and sync",
    commands: [
      "Pull the latest changes",
      "Sync with remote repository",
      "Get the newest code from GitHub",
      "Update my local repository"
    ],
    expectedIntents: ["pull_changes", "pull_changes", "pull_changes", "pull_changes"]
  },
  {
    name: "Pull Request Workflow",
    description: "Create and manage pull requests",
    commands: [
      "Create a pull request",
      "Open a PR for my changes",
      "Submit a pull request",
      "Make a merge request"
    ],
    expectedIntents: ["create_pr", "create_pr", "create_pr", "create_pr"]
  },
  {
    name: "Repository Management Workflow",
    description: "Manage repository settings and details",
    commands: [
      "Get details of my repository",
      "Show repository information",
      "Clone a repository",
      "Delete the test repository"
    ],
    expectedIntents: ["list_repos", "list_repos", "clone_repo", "unknown"]
  },
  {
    name: "Authentication Workflow",
    description: "Handle authentication and login",
    commands: [
      "Login to GitMate",
      "How do I authenticate?",
      "Use my GitHub token",
      "Am I logged in?",
      "Logout from GitMate"
    ],
    expectedIntents: ["greeting", "help", "greeting", "greeting", "greeting"]
  },
  {
    name: "Utility & Help Workflow",
    description: "Get help and utility functions",
    commands: [
      "What can GitMate do?",
      "Show me help",
      "Generate a commit message",
      "Initialize git here"
    ],
    expectedIntents: ["help", "help", "git_commit", "git_init"]
  }
];

async function testWorkflow(workflow, index) {
  console.log(`\n🔄 Testing Workflow ${index + 1}: ${workflow.name}`);
  console.log(`📝 ${workflow.description}`);
  console.log('─'.repeat(60));
  
  const results = [];
  
  for (let i = 0; i < workflow.commands.length; i++) {
    const command = workflow.commands[i];
    const expectedIntent = workflow.expectedIntents[i];
    
    console.log(`\n[${i + 1}/${workflow.commands.length}] Command: "${command}"`);
    console.log(`Expected Intent: ${expectedIntent}`);
    
    try {
      const result = await aiService.parseIntent(command);
      
      const testResult = {
        command: command,
        expectedIntent: expectedIntent,
        actualIntent: result.intent,
        entities: result.entities,
        confidence: result.confidence,
        success: result.intent === expectedIntent,
        error: null,
        timestamp: new Date().toISOString()
      };
      
      results.push(testResult);
      
      if (testResult.success) {
        console.log(`✅ PASS: ${result.intent} (confidence: ${result.confidence})`);
      } else {
        console.log(`❌ FAIL: Expected ${expectedIntent}, got ${result.intent} (confidence: ${result.confidence})`);
      }
      
    } catch (error) {
      const testResult = {
        command: command,
        expectedIntent: expectedIntent,
        actualIntent: 'error',
        entities: { error: error.message },
        confidence: 0.0,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      results.push(testResult);
      console.log(`💥 ERROR: ${error.message}`);
    }
    
    // Delay between commands
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}

async function runCompleteWorkflowTest() {
  console.log('🚀 Starting Complete GitHub Workflow Test Suite');
  console.log('='.repeat(80));
  console.log('This test simulates real GitHub workflows from start to finish');
  console.log('='.repeat(80));
  
  const allResults = [];
  const workflowSummaries = [];
  const startTime = Date.now();
  
  for (let i = 0; i < workflowTests.length; i++) {
    const workflow = workflowTests[i];
    const workflowResults = await testWorkflow(workflow, i);
    
    // Calculate workflow summary
    const totalCommands = workflowResults.length;
    const successfulCommands = workflowResults.filter(r => r.success).length;
    const failedCommands = totalCommands - successfulCommands;
    
    const workflowSummary = {
      workflowName: workflow.name,
      workflowDescription: workflow.description,
      totalCommands,
      successfulCommands,
      failedCommands,
      successRate: (successfulCommands / totalCommands * 100).toFixed(1) + '%',
      results: workflowResults
    };
    
    workflowSummaries.push(workflowSummary);
    allResults.push(...workflowResults);
    
    console.log(`\n📊 Workflow ${i + 1} Summary: ${successfulCommands}/${totalCommands} successful (${workflowSummary.successRate})`);
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  // Generate comprehensive report
  const totalCommands = allResults.length;
  const totalSuccessful = allResults.filter(r => r.success).length;
  const totalFailed = totalCommands - totalSuccessful;
  const overallSuccessRate = (totalSuccessful / totalCommands * 100).toFixed(1);
  
  // Intent accuracy analysis
  const intentAccuracy = {};
  workflowTests.forEach((workflow, index) => {
    const results = workflowSummaries[index].results;
    const correctIntents = results.filter(r => r.success).length;
    const totalIntents = results.length;
    intentAccuracy[workflow.name] = {
      correct: correctIntents,
      total: totalIntents,
      accuracy: (correctIntents / totalIntents * 100).toFixed(1) + '%'
    };
  });
  
  // Find most problematic workflows
  const problematicWorkflows = workflowSummaries
    .filter(w => parseFloat(w.successRate) < 80)
    .sort((a, b) => parseFloat(a.successRate) - parseFloat(b.successRate));
  
  // Find most problematic intents
  const intentFailures = {};
  allResults.forEach(result => {
    if (!result.success) {
      const expected = result.expectedIntent;
      const actual = result.actualIntent;
      const key = `${expected} → ${actual}`;
      intentFailures[key] = (intentFailures[key] || 0) + 1;
    }
  });
  
  const report = {
    summary: {
      totalWorkflows: workflowTests.length,
      totalCommands: totalCommands,
      totalSuccessful: totalSuccessful,
      totalFailed: totalFailed,
      overallSuccessRate: overallSuccessRate + '%',
      duration: `${duration}s`,
      timestamp: new Date().toISOString()
    },
    workflowSummaries,
    intentAccuracy,
    problematicWorkflows: problematicWorkflows.map(w => ({
      name: w.workflowName,
      successRate: w.successRate,
      failedCommands: w.failedCommands
    })),
    intentFailures,
    allResults
  };
  
  // Save detailed report
  const reportPath = path.join(process.cwd(), 'github-workflow-test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Print comprehensive summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPLETE WORKFLOW TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Workflows: ${workflowTests.length}`);
  console.log(`Total Commands: ${totalCommands}`);
  console.log(`Overall Success Rate: ${overallSuccessRate}%`);
  console.log(`Duration: ${duration}s`);
  
  console.log('\n📈 Workflow Performance:');
  workflowSummaries.forEach((summary, index) => {
    const status = parseFloat(summary.successRate) >= 80 ? '✅' : '⚠️';
    console.log(`${status} ${summary.workflowName}: ${summary.successRate} (${summary.successfulCommands}/${summary.totalCommands})`);
  });
  
  if (problematicWorkflows.length > 0) {
    console.log('\n⚠️  Problematic Workflows (< 80% success):');
    problematicWorkflows.forEach(workflow => {
      console.log(`  ${workflow.name}: ${workflow.successRate} (${workflow.failedCommands} failures)`);
    });
  }
  
  if (Object.keys(intentFailures).length > 0) {
    console.log('\n❌ Most Common Intent Failures:');
    Object.entries(intentFailures)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([failure, count]) => {
        console.log(`  ${failure}: ${count} times`);
      });
  }
  
  console.log(`\n📄 Detailed results saved to: ${reportPath}`);
  console.log('='.repeat(80));
  
  return report;
}

// Run the complete workflow test
runCompleteWorkflowTest().catch(console.error); 