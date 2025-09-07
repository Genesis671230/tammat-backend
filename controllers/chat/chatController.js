const OpenAI = require('openai');
const { chatComplete } = require('../../services/openaiService');
const catchAsync = require('../../utills/catchAsync');
const AppError = require('../../utills/appError');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

exports.processMessage = catchAsync(async (req, res, next) => {
  const { message, context } = req.body;

  if (!message) {
    return next(new AppError('Message is required', 400));
  }

  // Construct system message based on context
  let systemMessage = 'You are a helpful AI assistant for UAE visa applications. ';
  
  if (context.service) {
    systemMessage += `The user is currently applying for a ${context.service.name}. `;
  }

  if (context.step === 1) {
    systemMessage += 'The user is at the document upload stage. Help them understand which documents are required and guide them through the process. ';
  } else if (context.step === 2) {
    systemMessage += 'The user is providing personal information. Help them understand what information is needed and why. ';
  }

  if (context.documents?.length > 0) {
    systemMessage += `The user has already uploaded: ${context.documents.join(', ')}. `;
  }

  try {
    const { content: response } = await chatComplete([
      { role: 'system', content: systemMessage },
      { role: 'user', content: message }
    ], { model: 'gpt-4-turbo-preview', temperature: 0.7, max_tokens: 500 });

    // Extract potential actions from AI response
    const actions = [];
    const safeResponse = response || 'I am temporarily unavailable. Please try again shortly.';

    // Check for document requests in the response
    if (safeResponse.toLowerCase().includes('upload') || safeResponse.toLowerCase().includes('document')) {
      actions.push({ type: 'REQUEST_DOCUMENT' });
    }

    // Check for Amer officer requests
    if (safeResponse.toLowerCase().includes('amer officer') || safeResponse.toLowerCase().includes('human assistance')) {
      actions.push({ type: 'CONNECT_AMER' });
    }

    res.status(200).json({
      status: 'success',
      response: safeResponse,
      actions
    });
  } catch (error) {
    console.error('OpenAI API Error:', error);
    return next(new AppError('AI is temporarily unavailable. Please try again shortly.', 503));
  }
});

// Chat file upload (store server-side and return URL)
const chatStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    try {
      const roomId = req.body.roomId || req.query.roomId || 'general'
      const dest = path.join(__dirname, '../../uploads/chat', roomId)
      fs.mkdirSync(dest, { recursive: true })
      cb(null, dest)
    } catch (e) {
      cb(e)
    }
  },
  filename: function(req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9)
    const safeBase = (file.originalname || 'file').replace(/[^a-zA-Z0-9_.-]/g, '_')
    cb(null, unique + '-' + safeBase)
  }
})

const chatFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf' || file.mimetype === 'text/plain') {
    cb(null, true)
  } else {
    cb(new AppError('Unsupported file type', 400), false)
  }
}

const chatUpload = multer({ storage: chatStorage, fileFilter: chatFileFilter, limits: { fileSize: 20 * 1024 * 1024 } })

exports.chatUploadMiddleware = chatUpload.single('file')

exports.uploadChatFile = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No file uploaded', 400))
  }
  const roomId = req.query.roomId || 'general'
  const fileUrl = `/uploads/chat/${roomId}/${req.file.filename}`
  res.status(200).json({ status: 'success', data: { fileUrl, fileName: req.file.originalname, size: req.file.size } })
})

exports.handleWebSocket = (io) => {
  // Store available Amer officers
  const amerOfficers = new Map();
  // Store active chats
  const activeChats = new Map();

  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Handle Amer officer registration
    socket.on('register_amer', (data) => {
      amerOfficers.set(socket.id, {
        id: socket.id,
        name: data.name,
        available: true
      });
    });

    // Handle chat requests
    socket.on('request_amer', async (data) => {
      // Find available officer
      const availableOfficer = Array.from(amerOfficers.values())
        .find(officer => officer.available);

      if (availableOfficer) {
        // Create chat session
        const chatId = Date.now().toString();
        activeChats.set(chatId, {
          user: socket.id,
          officer: availableOfficer.id,
          service: data.service
        });

        // Mark officer as busy
        amerOfficers.get(availableOfficer.id).available = false;

        // Notify both parties
        socket.emit('chat_started', { chatId, officerName: availableOfficer.name });
        io.to(availableOfficer.id).emit('new_chat', { chatId, service: data.service });
      } else {
        socket.emit('no_officers', { message: 'No officers available. Please try again later.' });
      }
    });

    // Handle chat messages
    socket.on('chat_message', (data) => {
      const chat = Array.from(activeChats.values())
        .find(chat => chat.user === socket.id || chat.officer === socket.id);

      if (chat) {
        const targetId = socket.id === chat.user ? chat.officer : chat.user;
        io.to(targetId).emit('message', {
          type: socket.id === chat.user ? 'user' : 'amer',
          content: data.message
        });
      }
    });

    // Handle disconnections
    socket.on('disconnect', () => {
      // Clean up officer registration
      if (amerOfficers.has(socket.id)) {
        amerOfficers.delete(socket.id);
      }

      // Clean up active chats
      for (const [chatId, chat] of activeChats.entries()) {
        if (chat.user === socket.id || chat.officer === socket.id) {
          // Notify other party
          const otherId = socket.id === chat.user ? chat.officer : chat.user;
          io.to(otherId).emit('chat_ended', { chatId });

          // Free up officer if they were in this chat
          if (chat.officer === socket.id) {
            amerOfficers.get(chat.officer).available = true;
          }

          activeChats.delete(chatId);
        }
      }
    });
  });
};