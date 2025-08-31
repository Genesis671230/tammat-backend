const express = require('express');
const router = express.Router();
const chatController = require('./chatController');
const auth = require('../../middelwares/auth');

router.get('/applications/:id/messages', auth, chatController.listMessages);
router.post('/applications/:id/messages', auth, chatController.sendMessage);

// Voice call placeholders: integrate with Twilio/Agora later
router.post('/applications/:id/voice/start', auth, (req, res) => {
  res.json({ ok: true, provider: 'placeholder', roomId: `room_${req.params.id}` });
});
router.post('/applications/:id/voice/join', auth, (req, res) => {
  res.json({ ok: true, provider: 'placeholder', roomId: `room_${req.params.id}` });
});

module.exports = router; 