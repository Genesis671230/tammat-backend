const { Server } = require('socket.io');
const http = require('http');
const jwt = require('jsonwebtoken');

class WebSocketServer {
  constructor(server, options = {}) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
      },
      ...options
    });

    this.connectedUsers = new Map();
    this.connectedOfficers = new Map();
    this.chatRooms = new Map();
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        socket.userId = decoded.userId;
        socket.userType = decoded.userType || 'user';
        socket.userData = decoded;
        
        next();
      } catch (error) {
        console.error('WebSocket authentication error:', error.message);
        next(new Error('Authentication failed'));
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User connected: ${socket.userId} (${socket.userType})`);
      
      // Store user connection
      this.connectedUsers.set(socket.userId, {
        socketId: socket.id,
        userType: socket.userType,
        userData: socket.userData,
        connectedAt: new Date(),
        lastActivity: new Date()
      });

      // Handle user joining chat room
      socket.on('join_chat_room', (data) => {
        this.handleJoinChatRoom(socket, data);
      });

      // Handle user leaving chat room
      socket.on('leave_chat_room', (data) => {
        this.handleLeaveChatRoom(socket, data);
      });

      // Handle new message
      socket.on('send_message', (data) => {
        this.handleNewMessage(socket, data);
      });

      // Handle typing indicators
      socket.on('typing_start', (data) => {
        this.handleTypingStart(socket, data);
      });

      socket.on('typing_stop', (data) => {
        this.handleTypingStop(socket, data);
      });

      // Handle file sharing
      socket.on('file_upload_start', (data) => {
        this.handleFileUploadStart(socket, data);
      });

      socket.on('file_upload_complete', (data) => {
        this.handleFileUploadComplete(socket, data);
      });

      // Handle voice call requests
      socket.on('voice_call_request', (data) => {
        this.handleVoiceCallRequest(socket, data);
      });

      socket.on('voice_call_answer', (data) => {
        this.handleVoiceCallAnswer(socket, data);
      });

      socket.on('voice_call_reject', (data) => {
        this.handleVoiceCallReject(socket, data);
      });

      // Handle video call requests
      socket.on('video_call_request', (data) => {
        this.handleVideoCallRequest(socket, data);
      });

      socket.on('video_call_answer', (data) => {
        this.handleVideoCallAnswer(socket, data);
      });

      socket.on('video_call_reject', (data) => {
        this.handleVideoCallReject(socket, data);
      });

      // Handle call end
      socket.on('call_end', (data) => {
        this.handleCallEnd(socket, data);
      });

      // Handle officer status updates
      socket.on('officer_status_update', (data) => {
        this.handleOfficerStatusUpdate(socket, data);
      });

      // Handle user presence
      socket.on('user_presence', (data) => {
        this.handleUserPresence(socket, data);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    });
  }

  handleJoinChatRoom(socket, data) {
    const { roomId, userId, officerId } = data;
    
    try {
      // Join the room
      socket.join(roomId);
      
      // Update user's current room
      const userConnection = this.connectedUsers.get(userId);
      if (userConnection) {
        userConnection.currentRoom = roomId;
        userConnection.lastActivity = new Date();
      }

      // Create or update chat room
      if (!this.chatRooms.has(roomId)) {
        this.chatRooms.set(roomId, {
          id: roomId,
          userId,
          officerId,
          participants: [userId, officerId],
          status: 'active',
          createdAt: new Date(),
          lastActivity: new Date()
        });
      }

      // Notify other participants
      socket.to(roomId).emit('user_joined_room', {
        userId,
        roomId,
        timestamp: new Date()
      });

      // Send room info to the user
      socket.emit('room_joined', {
        roomId,
        participants: this.chatRooms.get(roomId).participants,
        timestamp: new Date()
      });

      console.log(`User ${userId} joined chat room: ${roomId}`);
    } catch (error) {
      console.error('Error joining chat room:', error);
      socket.emit('error', { message: 'Failed to join chat room' });
    }
  }

  handleLeaveChatRoom(socket, data) {
    const { roomId, userId } = data;
    
    try {
      socket.leave(roomId);
      
      // Update user's current room
      const userConnection = this.connectedUsers.get(userId);
      if (userConnection) {
        userConnection.currentRoom = null;
        userConnection.lastActivity = new Date();
      }

      // Notify other participants
      socket.to(roomId).emit('user_left_room', {
        userId,
        roomId,
        timestamp: new Date()
      });

      console.log(`User ${userId} left chat room: ${roomId}`);
    } catch (error) {
      console.error('Error leaving chat room:', error);
      socket.emit('error', { message: 'Failed to leave chat room' });
    }
  }

  handleNewMessage(socket, data) {
    const { roomId, message, userId } = data;
    
    try {
      // Broadcast message to room
      const messageData = {
        id: Date.now().toString(),
        content: message.content,
        type: message.type || 'text',
        sender: userId,
        timestamp: new Date(),
        status: 'sent',
        metadata: message.metadata || {}
      };

      // Update room activity
      if (this.chatRooms.has(roomId)) {
        const room = this.chatRooms.get(roomId);
        room.lastActivity = new Date();
        room.messages = room.messages || [];
        room.messages.push(messageData);
      }

      // Emit to all users in the room
      this.io.to(roomId).emit('new_message', messageData);

      // Update user activity
      const userConnection = this.connectedUsers.get(userId);
      if (userConnection) {
        userConnection.lastActivity = new Date();
      }

      console.log(`Message sent in room ${roomId} by user ${userId}`);
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  handleTypingStart(socket, data) {
    const { roomId, userId } = data;
    
    try {
      socket.to(roomId).emit('user_typing', {
        userId,
        isTyping: true,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error handling typing start:', error);
    }
  }

  handleTypingStop(socket, data) {
    const { roomId, userId } = data;
    
    try {
      socket.to(roomId).emit('user_typing', {
        userId,
        isTyping: false,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error handling typing stop:', error);
    }
  }

  handleFileUploadStart(socket, data) {
    const { roomId, userId, fileName, fileSize } = data;
    
    try {
      socket.to(roomId).emit('file_upload_start', {
        userId,
        fileName,
        fileSize,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error handling file upload start:', error);
    }
  }

  handleFileUploadComplete(socket, data) {
    const { roomId, userId, fileUrl, fileName, fileSize } = data;
    
    try {
      const messageData = {
        id: Date.now().toString(),
        content: 'File shared',
        type: 'file',
        sender: userId,
        timestamp: new Date(),
        status: 'sent',
        metadata: {
          fileUrl,
          fileName,
          fileSize
        }
      };

      // Update room messages
      if (this.chatRooms.has(roomId)) {
        const room = this.chatRooms.get(roomId);
        room.messages = room.messages || [];
        room.messages.push(messageData);
        room.lastActivity = new Date();
      }

      // Broadcast to room
      this.io.to(roomId).emit('file_upload_complete', messageData);
      this.io.to(roomId).emit('new_message', messageData);
    } catch (error) {
      console.error('Error handling file upload complete:', error);
    }
  }

  handleVoiceCallRequest(socket, data) {
    const { roomId, userId, targetUserId } = data;
    
    try {
      // Find target user's socket
      const targetConnection = this.connectedUsers.get(targetUserId);
      if (targetConnection) {
        this.io.to(targetConnection.socketId).emit('voice_call_request', {
          from: userId,
          roomId,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error handling voice call request:', error);
    }
  }

  handleVoiceCallAnswer(socket, data) {
    const { roomId, userId, accepted, targetUserId } = data;
    
    try {
      const targetConnection = this.connectedUsers.get(targetUserId);
      if (targetConnection) {
        this.io.to(targetConnection.socketId).emit('voice_call_answered', {
          by: userId,
          accepted,
          roomId,
          timestamp: new Date()
        });
      }

      if (accepted) {
        // Notify room participants about active call
        this.io.to(roomId).emit('voice_call_active', {
          participants: [userId, targetUserId],
          roomId,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error handling voice call answer:', error);
    }
  }

  handleVoiceCallReject(socket, data) {
    const { roomId, userId, targetUserId } = data;
    
    try {
      const targetConnection = this.connectedUsers.get(targetUserId);
      if (targetConnection) {
        this.io.to(targetConnection.socketId).emit('voice_call_rejected', {
          by: userId,
          roomId,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error handling voice call reject:', error);
    }
  }

  handleVideoCallRequest(socket, data) {
    const { roomId, userId, targetUserId } = data;
    
    try {
      const targetConnection = this.connectedUsers.get(targetUserId);
      if (targetConnection) {
        this.io.to(targetConnection.socketId).emit('video_call_request', {
          from: userId,
          roomId,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error handling video call request:', error);
    }
  }

  handleVideoCallAnswer(socket, data) {
    const { roomId, userId, accepted, targetUserId } = data;
    
    try {
      const targetConnection = this.connectedUsers.get(targetUserId);
      if (targetConnection) {
        this.io.to(targetConnection.socketId).emit('video_call_answered', {
          by: userId,
          accepted,
          roomId,
          timestamp: new Date()
        });
      }

      if (accepted) {
        // Notify room participants about active call
        this.io.to(roomId).emit('video_call_active', {
          participants: [userId, targetUserId],
          roomId,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error handling video call answer:', error);
    }
  }

  handleVideoCallReject(socket, data) {
    const { roomId, userId, targetUserId } = data;
    
    try {
      const targetConnection = this.connectedUsers.get(targetUserId);
      if (targetConnection) {
        this.io.to(targetConnection.socketId).emit('video_call_rejected', {
          by: userId,
          roomId,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error handling video call reject:', error);
    }
  }

  handleCallEnd(socket, data) {
    const { roomId, userId, callType } = data;
    
    try {
      // Notify room participants about call end
      this.io.to(roomId).emit('call_ended', {
        by: userId,
        callType,
        roomId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error handling call end:', error);
    }
  }

  handleOfficerStatusUpdate(socket, data) {
    const { officerId, status, isOnline } = data;
    
    try {
      // Update officer status
      if (isOnline) {
        this.connectedOfficers.set(officerId, {
          socketId: socket.id,
          status,
          lastUpdate: new Date()
        });
      } else {
        this.connectedOfficers.delete(officerId);
      }

      // Broadcast status update to all users
      this.io.emit('officer_status_updated', {
        officerId,
        status,
        isOnline,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error handling officer status update:', error);
    }
  }

  handleUserPresence(socket, data) {
    const { userId, status } = data;
    
    try {
      const userConnection = this.connectedUsers.get(userId);
      if (userConnection) {
        userConnection.status = status;
        userConnection.lastActivity = new Date();
      }

      // Broadcast presence update to user's current room
      if (userConnection && userConnection.currentRoom) {
        socket.to(userConnection.currentRoom).emit('user_presence_updated', {
          userId,
          status,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error handling user presence:', error);
    }
  }

  handleDisconnect(socket) {
    try {
      const userId = socket.userId;
      console.log(`User disconnected: ${userId}`);

      // Remove from connected users
      this.connectedUsers.delete(userId);

      // Remove from connected officers if applicable
      if (socket.userType === 'officer') {
        this.connectedOfficers.delete(userId);
      }

      // Notify room participants if user was in a room
      const userConnection = this.connectedUsers.get(userId);
      if (userConnection && userConnection.currentRoom) {
        socket.to(userConnection.currentRoom).emit('user_disconnected', {
          userId,
          roomId: userConnection.currentRoom,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  }

  // Public methods for external use
  getConnectedUsers() {
    return Array.from(this.connectedUsers.entries());
  }

  getConnectedOfficers() {
    return Array.from(this.connectedOfficers.entries());
  }

  getChatRooms() {
    return Array.from(this.chatRooms.entries());
  }

  sendToUser(userId, event, data) {
    const userConnection = this.connectedUsers.get(userId);
    if (userConnection) {
      this.io.to(userConnection.socketId).emit(event, data);
    }
  }

  sendToRoom(roomId, event, data) {
    this.io.to(roomId).emit(event, data);
  }

  broadcastToAll(event, data) {
    this.io.emit(event, data);
  }
}

module.exports = WebSocketServer; 