#!/usr/bin/env node

// Test script to verify the complete message flow between user and officer
const io = require('socket.io-client');

const BACKEND_URL = 'http://localhost:5001';

class MessageFlowTester {
  constructor() {
    this.userSocket = null;
    this.officerSocket = null;
    this.chatId = null;
    this.testResults = [];
  }

  async runTest() {
    console.log('🧪 Starting Message Flow Test');
    console.log('============================\n');

    try {
      // Step 1: Connect as officer
      await this.connectOfficer();
      
      // Step 2: Connect as user
      await this.connectUser();
      
      // Step 3: User requests officer
      await this.userRequestsOfficer();
      
      // Step 4: Officer accepts request
      await this.officerAcceptsRequest();
      
      // Step 5: Test message exchange
      await this.testMessageExchange();
      
      // Step 6: Display results
      this.displayResults();
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    } finally {
      this.cleanup();
    }
  }

  connectOfficer() {
    return new Promise((resolve) => {
      console.log('1️⃣ Connecting as Officer...');
      
      this.officerSocket = io(BACKEND_URL);
      
      this.officerSocket.on('connect', () => {
        console.log('   ✅ Officer connected:', this.officerSocket.id);
        
        // Register as officer
        this.officerSocket.emit('register_amer', { name: 'Test Officer' });
        
        // Listen for requests
        this.officerSocket.on('officer_request', (data) => {
          console.log('   📋 Officer received request:', data.requestId);
          this.testResults.push({ step: 'officer_request', success: true, data });
        });
        
        // Listen for chat session start
        this.officerSocket.on('chat_session_started', (data) => {
          console.log('   💬 Chat session started:', data.chatId);
          this.chatId = data.chatId;
          this.testResults.push({ step: 'chat_started', success: true, data });
        });
        
        // Listen for messages
        this.officerSocket.on('new_message', (data) => {
          console.log('   📨 Officer received message:', data.content);
          this.testResults.push({ step: 'officer_message_received', success: true, data });
        });
        
        resolve();
      });
    });
  }

  connectUser() {
    return new Promise((resolve) => {
      console.log('2️⃣ Connecting as User...');
      
      this.userSocket = io(BACKEND_URL);
      
      this.userSocket.on('connect', () => {
        console.log('   ✅ User connected:', this.userSocket.id);
        
        // Listen for request confirmation
        this.userSocket.on('request_sent', (data) => {
          console.log('   📤 Request sent confirmation:', data.requestId);
          this.testResults.push({ step: 'request_sent', success: true, data });
        });
        
        // Listen for officer connection
        this.userSocket.on('amer_connected', (data) => {
          console.log('   🎉 Connected to officer:', data.officerName);
          this.chatId = data.chatId;
          this.testResults.push({ step: 'amer_connected', success: true, data });
        });
        
        // Listen for messages
        this.userSocket.on('new_message', (data) => {
          console.log('   📨 User received message:', data.content);
          this.testResults.push({ step: 'user_message_received', success: true, data });
        });
        
        resolve();
      });
    });
  }

  userRequestsOfficer() {
    return new Promise((resolve) => {
      console.log('3️⃣ User requests officer...');
      
      this.userSocket.emit('request_amer_connection', { 
        service: 'Test Visa Application' 
      });
      
      setTimeout(() => {
        resolve();
      }, 1000);
    });
  }

  officerAcceptsRequest() {
    return new Promise((resolve) => {
      console.log('4️⃣ Officer accepts request...');
      
      // Find the request ID from test results
      const requestData = this.testResults.find(r => r.step === 'officer_request');
      if (requestData) {
        this.officerSocket.emit('officer_accept_request', { 
          requestId: requestData.data.requestId 
        });
      }
      
      setTimeout(() => {
        resolve();
      }, 1000);
    });
  }

  testMessageExchange() {
    return new Promise((resolve) => {
      console.log('5️⃣ Testing message exchange...');
      
      if (!this.chatId) {
        console.log('   ❌ No chat ID available');
        resolve();
        return;
      }
      
      // User sends message
      console.log('   📤 User sends message...');
      this.userSocket.emit('chat_message', {
        message: 'Hello Officer, I need help with my visa application',
        chatId: this.chatId,
        type: 'text'
      });
      
      setTimeout(() => {
        // Officer sends reply
        console.log('   📤 Officer sends reply...');
        this.officerSocket.emit('chat_message', {
          message: 'Hello! I\'m here to help you with your visa application. What specific assistance do you need?',
          chatId: this.chatId,
          type: 'text'
        });
        
        setTimeout(() => {
          resolve();
        }, 1000);
      }, 1000);
    });
  }

  displayResults() {
    console.log('\n📊 Test Results');
    console.log('================');
    
    const steps = [
      'officer_request',
      'request_sent', 
      'amer_connected',
      'chat_started',
      'user_message_received',
      'officer_message_received'
    ];
    
    steps.forEach(step => {
      const result = this.testResults.find(r => r.step === step);
      const status = result ? '✅' : '❌';
      console.log(`${status} ${step}: ${result ? 'PASS' : 'FAIL'}`);
    });
    
    const passed = this.testResults.length;
    const total = steps.length;
    console.log(`\n🎯 Overall: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! Message flow is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Check the implementation.');
    }
  }

  cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (this.userSocket) {
      this.userSocket.disconnect();
    }
    
    if (this.officerSocket) {
      this.officerSocket.disconnect();
    }
    
    console.log('✅ Cleanup complete');
  }
}

// Run the test
const tester = new MessageFlowTester();
tester.runTest().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
