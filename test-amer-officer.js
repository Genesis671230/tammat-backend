#!/usr/bin/env node

// Test script to simulate an Amer officer for testing the connection flow
const io = require('socket.io-client');

const BACKEND_URL = 'http://localhost:5001';

class AmerOfficerSimulator {
  constructor(name = 'Test Officer') {
    this.name = name;
    this.socket = null;
    this.available = true;
    this.pendingRequests = new Map();
  }

  connect() {
    console.log(`🔗 ${this.name} connecting to server...`);
    
    this.socket = io(BACKEND_URL, {
      transports: ['websocket']
    });

    this.socket.on('connect', () => {
      console.log(`✅ ${this.name} connected with ID: ${this.socket.id}`);
      this.registerAsOfficer();
    });

    this.socket.on('disconnect', () => {
      console.log(`❌ ${this.name} disconnected`);
    });

    // Listen for user requests
    this.socket.on('officer_request', (data) => {
      console.log(`\n📋 New request received:`);
      console.log(`   Request ID: ${data.requestId}`);
      console.log(`   Service: ${data.userInfo.service}`);
      console.log(`   Message: ${data.message}`);
      console.log(`   Timestamp: ${data.userInfo.timestamp}`);
      
      this.pendingRequests.set(data.requestId, data);
      this.promptForAction(data.requestId);
    });

    // Listen for request cancellations
    this.socket.on('request_cancelled', (data) => {
      console.log(`\n🚫 Request ${data.requestId} was cancelled`);
      if (data.reason) {
        console.log(`   Reason: ${data.reason}`);
      }
      this.pendingRequests.delete(data.requestId);
    });

    // Listen for requests taken by other officers
    this.socket.on('request_taken', (data) => {
      console.log(`\n👤 Request ${data.requestId} was taken by ${data.takenBy}`);
      this.pendingRequests.delete(data.requestId);
    });

    // Listen for chat session start
    this.socket.on('chat_session_started', (data) => {
      console.log(`\n💬 Chat session started:`);
      console.log(`   Chat ID: ${data.chatId}`);
      console.log(`   User Service: ${data.userService}`);
      console.log(`   You can now chat with the user!`);
      
      this.available = false;
      this.startChatMode(data.chatId);
    });

    // Listen for message confirmations
    this.socket.on('message_sent', (data) => {
      console.log(`✅ Message delivery confirmed: ${data.content}`);
    });

    // Listen for message errors
    this.socket.on('message_error', (data) => {
      console.log(`❌ Message error: ${data.error}`);
    });

    // Handle errors
    this.socket.on('connect_error', (error) => {
      console.error(`❌ Connection error: ${error.message}`);
    });
  }

  registerAsOfficer() {
    console.log(`📝 Registering as Amer officer: ${this.name}`);
    this.socket.emit('register_amer', { name: this.name });
    
    console.log(`\n🎯 ${this.name} is now available for user requests`);
    console.log(`   Waiting for users to request assistance...`);
    console.log(`   Press Ctrl+C to exit\n`);
  }

  promptForAction(requestId) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`\n🤔 Do you want to accept this request? (y/n/i for info): `, (answer) => {
      const choice = answer.toLowerCase().trim();
      
      if (choice === 'y' || choice === 'yes') {
        this.acceptRequest(requestId);
      } else if (choice === 'n' || choice === 'no') {
        this.declineRequest(requestId);
      } else if (choice === 'i' || choice === 'info') {
        this.showRequestInfo(requestId);
        this.promptForAction(requestId);
        return;
      } else {
        console.log('Please enter y (yes), n (no), or i (info)');
        this.promptForAction(requestId);
        return;
      }
      
      rl.close();
    });
  }

  acceptRequest(requestId) {
    console.log(`✅ Accepting request ${requestId}...`);
    this.socket.emit('officer_accept_request', { requestId });
  }

  declineRequest(requestId) {
    console.log(`❌ Declining request ${requestId}...`);
    this.socket.emit('officer_decline_request', { 
      requestId, 
      reason: 'Not available at the moment' 
    });
    this.pendingRequests.delete(requestId);
  }

  showRequestInfo(requestId) {
    const request = this.pendingRequests.get(requestId);
    if (request) {
      console.log(`\n📊 Request Details:`);
      console.log(`   ID: ${requestId}`);
      console.log(`   User ID: ${request.userInfo.id}`);
      console.log(`   Service: ${request.userInfo.service}`);
      console.log(`   Time: ${new Date(request.userInfo.timestamp).toLocaleString()}`);
      console.log(`   Message: ${request.message}`);
    }
  }

  startChatMode(chatId) {
    console.log(`\n💬 Entering chat mode for session: ${chatId}`);
    console.log(`Type messages to send to the user, or 'quit' to end the session:`);

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: `${this.name}> `
    });

    // Listen for messages from user
    this.socket.on('new_message', (data) => {
      console.log(`\n📨 Received message:`, data);
      if (data.sender === 'user' || data.type === 'user') {
        console.log(`👤 User: ${data.content}`);
        rl.prompt();
      }
    });

    // Also listen for legacy message format
    this.socket.on('message', (data) => {
      if (data.type === 'user') {
        console.log(`\n👤 User (legacy): ${data.content}`);
        rl.prompt();
      }
    });

    rl.prompt();

    rl.on('line', (line) => {
      const message = line.trim();
      
      if (message.toLowerCase() === 'quit') {
        console.log(`👋 Ending chat session...`);
        rl.close();
        this.available = true;
        return;
      }

      if (message) {
        console.log(`📤 Sending message: "${message}"`);
        this.socket.emit('chat_message', {
          message,
          chatId,
          type: 'text'
        });
        console.log(`✅ Message sent to chat ${chatId}`);
      }
      
      rl.prompt();
    });

    rl.on('close', () => {
      console.log(`\n👋 Chat session ended. Returning to available status.`);
      this.available = true;
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Main execution
const officerName = process.argv[2] || 'Test Officer';
const officer = new AmerOfficerSimulator(officerName);

console.log(`🚀 Starting Amer Officer Simulator`);
console.log(`👤 Officer Name: ${officerName}`);
console.log(`🌐 Backend URL: ${BACKEND_URL}`);
console.log(`\n📝 This will simulate an Amer officer connecting to the system.`);
console.log(`   Users can request assistance and you can accept/decline requests.`);

// Handle process termination
process.on('SIGINT', () => {
  console.log(`\n\n👋 ${officerName} signing off...`);
  officer.disconnect();
  process.exit(0);
});

// Start the simulation
officer.connect();
