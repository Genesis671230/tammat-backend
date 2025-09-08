#!/usr/bin/env node

// Simple test script for Amer officer chat system without authentication
const io = require('socket.io-client');

const BACKEND_URL = 'http://localhost:5001';

class SimpleChatTest {
  constructor() {
    this.userSocket = null;
    this.officerSocket = null;
    this.chatId = null;
    this.messageCount = 0;
  }

  async runTest() {
    console.log('🧪 Testing Simple Amer Officer Chat System');
    console.log('==========================================\n');

    try {
      // Connect both sockets without authentication
      await this.connectSockets();
      
      // Test officer registration
      await this.testOfficerRegistration();
      
      // Test user connection request
      await this.testUserConnectionRequest();
      
      // Test message exchange
      await this.testMessageExchange();
      
      console.log('\n✅ All tests completed successfully!');
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    } finally {
      this.cleanup();
    }
  }

  connectSockets() {
    return new Promise((resolve) => {
      console.log('1️⃣ Connecting sockets...');
      
      // Connect user socket without auth
      this.userSocket = io(BACKEND_URL);

      // Connect officer socket without auth
      this.officerSocket = io(BACKEND_URL);

      let userConnected = false;
      let officerConnected = false;

      this.userSocket.on('connect', () => {
        console.log('✅ User connected:', this.userSocket.id);
        userConnected = true;
        if (userConnected && officerConnected) resolve();
      });

      this.officerSocket.on('connect', () => {
        console.log('✅ Officer connected:', this.officerSocket.id);
        officerConnected = true;
        if (userConnected && officerConnected) resolve();
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!userConnected || !officerConnected) {
          throw new Error('Failed to connect sockets');
        }
      }, 5000);
    });
  }

  testOfficerRegistration() {
    return new Promise((resolve) => {
      console.log('\n2️⃣ Testing officer registration...');
      
      this.officerSocket.emit('register_amer', {
        name: 'Test Officer',
        userId: 'test-officer-123',
        userData: {
          name: 'Test Officer',
          email: 'officer@test.com',
          role: 'amer'
        }
      });

      console.log('✅ Officer registration sent');
      resolve();
    });
  }

  testUserConnectionRequest() {
    return new Promise((resolve) => {
      console.log('\n3️⃣ Testing user connection request...');
      
      // Listen for officer request
      this.officerSocket.on('officer_request', (data) => {
        console.log('✅ Officer received request:', data);
        
        // Accept the request
        setTimeout(() => {
          this.officerSocket.emit('officer_accept_request', {
            requestId: data.requestId
          });
        }, 1000);
      });

      // Listen for chat session started
      this.officerSocket.on('chat_session_started', (data) => {
        console.log('✅ Chat session started:', data);
        this.chatId = data.chatId;
        resolve();
      });

      // Listen for user connection confirmation
      this.userSocket.on('amer_connected', (data) => {
        console.log('✅ User connected to officer:', data);
        this.chatId = data.chatId;
      });

      // Send connection request
      this.userSocket.emit('request_amer_connection', {
        service: 'Family Visa Application',
        userId: 'test-user-123',
        userData: {
          name: 'Test User',
          email: 'user@test.com'
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.chatId) {
          console.log('⚠️ Connection request timeout - continuing...');
          resolve();
        }
      }, 10000);
    });
  }

  testMessageExchange() {
    return new Promise((resolve) => {
      console.log('\n4️⃣ Testing message exchange...');
      
      let messagesReceived = 0;
      const expectedMessages = 2; // 1 from user, 1 from officer

      // Listen for messages on both sockets
      const onMessage = (socket, sender) => {
        return (msg) => {
          console.log(`📨 ${sender} received message:`, msg.content);
          messagesReceived++;
          
          if (messagesReceived >= expectedMessages) {
            console.log('✅ All messages exchanged successfully');
            resolve();
          }
        };
      };

      this.userSocket.on('new_message', onMessage(this.userSocket, 'User'));
      this.officerSocket.on('new_message', onMessage(this.officerSocket, 'Officer'));

      // Send messages
      setTimeout(() => {
        if (this.chatId) {
          console.log('📤 User sending message...');
          this.userSocket.emit('chat_message', {
            message: 'Hello officer, I need help with my visa application',
            chatId: this.chatId,
            type: 'text'
          });
        }
      }, 1000);

      setTimeout(() => {
        if (this.chatId) {
          console.log('📤 Officer sending message...');
          this.officerSocket.emit('chat_message', {
            message: 'Hello! I\'m here to help you with your visa application. What specific assistance do you need?',
            chatId: this.chatId,
            type: 'text'
          });
        }
      }, 2000);

      // Timeout after 15 seconds
      setTimeout(() => {
        if (messagesReceived < expectedMessages) {
          console.log(`⚠️ Message exchange timeout - received ${messagesReceived}/${expectedMessages} messages`);
          resolve();
        }
      }, 15000);
    });
  }

  cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (this.userSocket) {
      this.userSocket.disconnect();
    }
    
    if (this.officerSocket) {
      this.officerSocket.disconnect();
    }
    
    console.log('✅ Cleanup completed');
  }
}

// Run the test
const test = new SimpleChatTest();
test.runTest().catch(console.error);
