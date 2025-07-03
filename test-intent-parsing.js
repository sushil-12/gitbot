import { aiService } from './src/services/aiServiceFactory.js';
import fs from 'fs';
import path from 'path';

// Test commands organized by category
const testCommands = [
  // Repository Management
  "Create a new repository called my-awesome-app",
  "Make a repo named todo-app", 
  "Can you start a new repo for me called portfolio-site?",
  "Initialize a fresh GitHub repo titled gitmate-demo",
  "Create a public repo named open-source-gems",
  "I want to delete the repository test-app",
  
  // Authentication & Login
  "Login to GitMate",
  "How do I log in?",
  "Use my GitHub token to sign in",
  "Logout from GitMate", 
  "Am I already logged in?",
  
  // Push & Commit
  "Push my latest code",
  "Commit and push all my changes",
  "Stage all files and push to GitHub",
  "I want to upload my code to a new repo",
  "Push changes with message \"added login flow\"",
  
  // Listing & Info
  "List all my GitHub repositories",
  "Show me my recent commits",
  "How many repos do I have?",
  "Get details of the repo blog-engine",
  
  // Miscellaneous & Utility
  "Generate a commit message for the changes I made",
  "Initialize a git project here",
  "Set description for this repo to 'a demo for GitMate'",
  "Open the GitHub page for this project",
  "What can GitMate do?"
];

async function testIntentParsing() {
  console.log('🧪 Starting Intent Parsing Test Suite...\n');
  
  const results = [];
  const startTime = Date.now();
  
  for (let i = 0; i < testCommands.length; i++) {
    const command = testCommands[i];
    console.log(`\n[${i + 1}/${testCommands.length}] Testing: "${command}"`);
    
    try {
      const result = await aiService.parseIntent(command);
      
      const testResult = {
        command: command,
        intent: result.intent,
        entities: result.entities,
        confidence: result.confidence,
        success: true,
        error: null,
        timestamp: new Date().toISOString()
      };
      
      results.push(testResult);
      console.log(`✅ Intent: ${result.intent} (confidence: ${result.confidence})`);
      
    } catch (error) {
      const testResult = {
        command: command,
        intent: 'error',
        entities: { error: error.message },
        confidence: 0.0,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      results.push(testResult);
      console.log(`❌ Error: ${error.message}`);
    }
    
    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  // Generate summary
  const summary = {
    totalTests: testCommands.length,
    successfulTests: results.filter(r => r.success).length,
    failedTests: results.filter(r => !r.success).length,
    duration: `${duration}s`,
    timestamp: new Date().toISOString(),
    intentDistribution: {},
    lowConfidenceResults: [],
    unexpectedIntents: []
  };
  
  // Analyze intent distribution
  results.forEach(result => {
    if (result.success) {
      summary.intentDistribution[result.intent] = (summary.intentDistribution[result.intent] || 0) + 1;
      
      // Flag low confidence results
      if (result.confidence < 0.7) {
        summary.lowConfidenceResults.push({
          command: result.command,
          intent: result.intent,
          confidence: result.confidence
        });
      }
      
      // Flag potentially unexpected intents
      const unexpectedIntents = ['unknown', 'error', 'unrelated'];
      if (unexpectedIntents.includes(result.intent)) {
        summary.unexpectedIntents.push({
          command: result.command,
          intent: result.intent,
          confidence: result.confidence
        });
      }
    }
  });
  
  // Create detailed report
  const report = {
    summary,
    results,
    testCommands
  };
  
  // Save to file
  const reportPath = path.join(process.cwd(), 'intent-parsing-test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${summary.totalTests}`);
  console.log(`Successful: ${summary.successfulTests}`);
  console.log(`Failed: ${summary.failedTests}`);
  console.log(`Duration: ${summary.duration}`);
  
  console.log('\n📈 Intent Distribution:');
  Object.entries(summary.intentDistribution)
    .sort(([,a], [,b]) => b - a)
    .forEach(([intent, count]) => {
      console.log(`  ${intent}: ${count}`);
    });
  
  if (summary.lowConfidenceResults.length > 0) {
    console.log('\n⚠️  Low Confidence Results (< 0.7):');
    summary.lowConfidenceResults.forEach(item => {
      console.log(`  "${item.command}" → ${item.intent} (${item.confidence})`);
    });
  }
  
  if (summary.unexpectedIntents.length > 0) {
    console.log('\n❓ Unexpected Intents (unknown/error/unrelated):');
    summary.unexpectedIntents.forEach(item => {
      console.log(`  "${item.command}" → ${item.intent} (${item.confidence})`);
    });
  }
  
  console.log(`\n📄 Detailed results saved to: ${reportPath}`);
  console.log('='.repeat(60));
  
  return report;
}

// Run the test
testIntentParsing().catch(console.error); 