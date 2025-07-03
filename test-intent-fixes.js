import { aiService } from './src/services/aiServiceFactory.js';
import fs from 'fs';
import path from 'path';

// Test cases specifically designed to catch the issues found in the workflow test
const testCases = [
  // Repository Listing & Discovery - These were all failing
  {
    category: "Repository Listing",
    tests: [
      { query: "List all my GitHub repositories", expected: "list_repos" },
      { query: "Show my repositories", expected: "list_repos" },
      { query: "What repositories do I have?", expected: "list_repos" },
      { query: "Display all my repos", expected: "list_repos" }
    ]
  },
  
  // Git Status & Changes - These were all failing
  {
    category: "Git Status & Changes",
    tests: [
      { query: "Show me the current status", expected: "git_status" },
      { query: "What's changed in my repository?", expected: "git_status" },
      { query: "Show me the differences", expected: "git_diff" },
      { query: "Display the git status", expected: "git_status" }
    ]
  },
  
  // Branch Management - Some were failing
  {
    category: "Branch Management",
    tests: [
      { query: "List all branches", expected: "list_branches" },
      { query: "Show my branches", expected: "list_branches" },
      { query: "Create a new branch called feature-login", expected: "create_branch" },
      { query: "Switch to the main branch", expected: "checkout_branch" },
      { query: "Checkout the develop branch", expected: "checkout_branch" }
    ]
  },
  
  // Commit & Push - Some were failing
  {
    category: "Commit & Push",
    tests: [
      { query: "Stage all my changes", expected: "git_add" },
      { query: "Add all files to staging", expected: "git_add" },
      { query: "Commit with message 'Add login functionality'", expected: "git_commit" },
      { query: "Push my changes to GitHub", expected: "push_changes" },
      { query: "Commit and push all changes", expected: "push_changes" }
    ]
  },
  
  // Pull & Sync - Some were failing
  {
    category: "Pull & Sync",
    tests: [
      { query: "Pull the latest changes", expected: "pull_changes" },
      { query: "Sync with remote repository", expected: "pull_changes" },
      { query: "Get the newest code from GitHub", expected: "pull_changes" },
      { query: "Update my local repository", expected: "pull_changes" }
    ]
  },
  
  // Pull Request - These were all failing
  {
    category: "Pull Request",
    tests: [
      { query: "Create a pull request", expected: "create_pr" },
      { query: "Open a PR for my changes", expected: "create_pr" },
      { query: "Submit a pull request", expected: "create_pr" },
      { query: "Make a merge request", expected: "create_pr" }
    ]
  },
  
  // Repository Management - These were all failing
  {
    category: "Repository Management",
    tests: [
      { query: "Get details of my repository", expected: "list_repos" },
      { query: "Show repository information", expected: "list_repos" },
      { query: "Clone a repository", expected: "clone_repo" },
      { query: "Delete the test repository", expected: "unknown" }
    ]
  },
  
  // Authentication - These were mostly failing
  {
    category: "Authentication",
    tests: [
      { query: "Login to GitMate", expected: "greeting" },
      { query: "How do I authenticate?", expected: "help" },
      { query: "Use my GitHub token", expected: "greeting" },
      { query: "Am I logged in?", expected: "greeting" },
      { query: "Logout from GitMate", expected: "greeting" }
    ]
  },
  
  // Utility & Help - Some were failing
  {
    category: "Utility & Help",
    tests: [
      { query: "What can GitMate do?", expected: "help" },
      { query: "Show me help", expected: "help" },
      { query: "Generate a commit message", expected: "git_commit" },
      { query: "Initialize git here", expected: "git_init" }
    ]
  }
];

async function testIntentFix(category, testCase, index) {
  console.log(`\n[${index + 1}] Testing: "${testCase.query}"`);
  console.log(`Expected: ${testCase.expected}`);
  
  try {
    const result = await aiService.parseIntent(testCase.query);
    
    const success = result.intent === testCase.expected;
    const status = success ? '✅ PASS' : '❌ FAIL';
    
    console.log(`Result: ${result.intent} (confidence: ${result.confidence})`);
    console.log(`${status}: ${success ? 'Correct intent detected' : `Expected ${testCase.expected}, got ${result.intent}`}`);
    
    return {
      category,
      query: testCase.query,
      expected: testCase.expected,
      actual: result.intent,
      confidence: result.confidence,
      success,
      entities: result.entities,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.log(`💥 ERROR: ${error.message}`);
    return {
      category,
      query: testCase.query,
      expected: testCase.expected,
      actual: 'error',
      confidence: 0.0,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function runIntentFixTests() {
  console.log('🔧 Testing Intent Parsing Fixes');
  console.log('='.repeat(60));
  console.log('This test verifies that the intent parsing fixes work correctly');
  console.log('='.repeat(60));
  
  const allResults = [];
  const categoryResults = {};
  const startTime = Date.now();
  
  for (const category of testCases) {
    console.log(`\n📋 Testing Category: ${category.category}`);
    console.log('─'.repeat(40));
    
    const categoryResultsList = [];
    
    for (let i = 0; i < category.tests.length; i++) {
      const testCase = category.tests[i];
      const result = await testIntentFix(category.category, testCase, i);
      categoryResultsList.push(result);
      allResults.push(result);
      
      // Small delay to avoid overwhelming the service
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Calculate category summary
    const totalTests = categoryResultsList.length;
    const successfulTests = categoryResultsList.filter(r => r.success).length;
    const successRate = (successfulTests / totalTests * 100).toFixed(1);
    
    categoryResults[category.category] = {
      total: totalTests,
      successful: successfulTests,
      failed: totalTests - successfulTests,
      successRate: successRate + '%',
      results: categoryResultsList
    };
    
    console.log(`\n📊 ${category.category} Summary: ${successfulTests}/${totalTests} successful (${successRate}%)`);
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  // Generate comprehensive report
  const totalTests = allResults.length;
  const totalSuccessful = allResults.filter(r => r.success).length;
  const totalFailed = totalTests - totalSuccessful;
  const overallSuccessRate = (totalSuccessful / totalTests * 100).toFixed(1);
  
  // Find most problematic categories
  const problematicCategories = Object.entries(categoryResults)
    .filter(([, stats]) => parseFloat(stats.successRate) < 80)
    .sort(([,a], [,b]) => parseFloat(a.successRate) - parseFloat(b.successRate));
  
  // Find most common failures
  const intentFailures = {};
  allResults.forEach(result => {
    if (!result.success) {
      const key = `${result.expected} → ${result.actual}`;
      intentFailures[key] = (intentFailures[key] || 0) + 1;
    }
  });
  
  const report = {
    summary: {
      totalTests,
      totalSuccessful,
      totalFailed,
      overallSuccessRate: overallSuccessRate + '%',
      duration: `${duration}s`,
      timestamp: new Date().toISOString()
    },
    categoryResults,
    problematicCategories: problematicCategories.map(([name, stats]) => ({
      name,
      successRate: stats.successRate,
      failedTests: stats.failed
    })),
    intentFailures,
    allResults
  };
  
  // Save detailed report
  const reportPath = path.join(process.cwd(), 'intent-fix-test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Print comprehensive summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 INTENT FIX TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Overall Success Rate: ${overallSuccessRate}%`);
  console.log(`Duration: ${duration}s`);
  
  console.log('\n📈 Category Performance:');
  Object.entries(categoryResults).forEach(([category, stats]) => {
    const status = parseFloat(stats.successRate) >= 80 ? '✅' : '⚠️';
    console.log(`${status} ${category}: ${stats.successRate} (${stats.successful}/${stats.total})`);
  });
  
  if (problematicCategories.length > 0) {
    console.log('\n⚠️  Problematic Categories (< 80% success):');
    problematicCategories.forEach(([category, stats]) => {
      console.log(`  ${category}: ${stats.successRate} (${stats.failed} failures)`);
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
  console.log('='.repeat(60));
  
  return report;
}

// Run the intent fix tests
runIntentFixTests().catch(console.error); 