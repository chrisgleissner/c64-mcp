#!/usr/bin/env node

// Demo script to test the new analyze_audio tool

import axios from 'axios';

const baseUrl = 'http://localhost:8000';

async function testAudioAnalysis() {
  console.log('Testing the new analyze_audio tool...\n');

  // Test cases
  const testCases = [
    {
      name: 'Non-audio request (should not trigger)',
      request: 'hello world',
      expectAnalysis: false
    },
    {
      name: 'Audio verification request (should trigger)',
      request: 'check the music',
      expectAnalysis: true
    },
    {
      name: 'Sound quality check (should trigger)',
      request: 'does the song sound right?',
      expectAnalysis: true
    },
    {
      name: 'SID test request (should trigger)',
      request: 'verify the SID output',
      expectAnalysis: true
    },
    {
      name: 'Generic check (should not trigger)',
      request: 'check the screen',
      expectAnalysis: false
    }
  ];

  for (const testCase of testCases) {
    console.log(`Testing: "${testCase.request}"`);
    
    try {
      const response = await axios.post(`${baseUrl}/tools/analyze_audio`, {
        request: testCase.request,
        durationSeconds: 1.0  // Short duration for testing
      });

      const analyzed = response.data.analyzed;
      const passed = analyzed === testCase.expectAnalysis;
      
      console.log(`  Expected analysis: ${testCase.expectAnalysis}`);
      console.log(`  Actual analysis: ${analyzed}`);
      console.log(`  Result: ${passed ? '✓ PASS' : '✗ FAIL'}`);
      
      if (analyzed && response.data.feedback) {
        console.log(`  Feedback: ${response.data.feedback}`);
      } else if (!analyzed && response.data.reason) {
        console.log(`  Reason: ${response.data.reason}`);
      }
      
    } catch (error) {
      console.log(`  Error: ${error.response?.data?.error || error.message}`);
    }
    
    console.log('');
  }
}

testAudioAnalysis().catch(console.error);