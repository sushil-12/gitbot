#!/bin/bash

# GitMate Demo Test Runner
# This script runs the comprehensive demo test suite to validate all commands for the promotional video

set -e

echo "🚀 GitMate Demo Test Runner"
echo "=========================="
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed or not in PATH"
    exit 1
fi

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the GitMate project root directory"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if GitMate is installed globally
if ! command -v gitmate &> /dev/null; then
    echo "⚠️  Warning: GitMate is not installed globally"
    echo "   You can install it with: npm install -g sushil-gitmate"
    echo "   Or run the test with: node demo-test-script.js"
    echo ""
fi

echo "🧪 Running Demo Test Suite..."
echo "This will test all commands that will be demonstrated in the promotional video"
echo ""

# Run the demo test script
node demo-test-script.js

echo ""
echo "✅ Demo test completed!"
echo ""
echo "📋 Next Steps:"
echo "   1. Review any failed tests above"
echo "   2. Fix any issues before recording the video"
echo "   3. Run this test again to verify fixes"
echo "   4. Proceed with video recording when all tests pass"
echo "" 