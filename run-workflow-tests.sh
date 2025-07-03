#!/bin/bash

echo "🚀 Running Complete GitHub Workflow Test Suite"
echo "=============================================="
echo "This test simulates real GitHub workflows from start to finish"
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    exit 1
fi

# Check if the test file exists
if [ ! -f "test-github-workflow.js" ]; then
    echo "❌ test-github-workflow.js not found in current directory"
    exit 1
fi

echo "✅ Starting comprehensive workflow tests..."
echo "📝 Results will be saved to github-workflow-test-results.json"
echo "⏱️  This may take several minutes as it tests 10 complete workflows"
echo ""

# Run the workflow test
node test-github-workflow.js

echo ""
echo "🎉 Workflow test completed!"
echo "📊 Check github-workflow-test-results.json for detailed analysis"
echo "🔍 Look for problematic workflows and intent failures" 