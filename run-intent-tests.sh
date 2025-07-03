#!/bin/bash

echo "🧪 Running GitMate Intent Parsing Test Suite"
echo "=============================================="

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    exit 1
fi

# Check if the test file exists
if [ ! -f "test-intent-parsing.js" ]; then
    echo "❌ test-intent-parsing.js not found in current directory"
    exit 1
fi

echo "✅ Starting tests..."
echo "📝 Results will be saved to intent-parsing-test-results.json"
echo ""

# Run the test
node test-intent-parsing.js

echo ""
echo "🎉 Test completed!"
echo "📊 Check intent-parsing-test-results.json for detailed results" 