const ChatMessage = require('../../model/schema/chatMessage');
const OpenAI = require('openai');
const { getServiceById } = require('../../services/catalogLoader');

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const listMessages = async (req, res) => {
  try {
    const messages = await ChatMessage.find({ application: req.params.id }).sort({ createdAt: 1 });
    return res.json({ messages });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to list messages' });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { content, language, serviceId } = req.body;
    const sender = req.user?.userId;

    const message = await ChatMessage.create({
      application: req.params.id,
      sender,
      content,
      language: language || 'auto',
      role: 'user'
    });

    let aiMessage = null;
    if (openai) {
      try {
        let serviceContext = '';
        if (serviceId) {
          const svc = getServiceById(serviceId);
          if (svc) {
            serviceContext = `\nService: ${svc.name}\nRequired Documents: ${svc.requiredDocuments.join('; ')}\nPrices: ${svc.prices.map(p=>`${p.type}:${p.amount} ${p.currency}`).join(', ')}`;
          }
        }
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a helpful UAE visa services assistant. Be concise, multilingual, and accurate. Always follow GDRFA guidance. If uncertain, ask for missing documents.' },
            { role: 'system', content: serviceContext },
            { role: 'user', content }
          ]
        });
        const reply = completion.choices?.[0]?.message?.content || '';
        aiMessage = await ChatMessage.create({
          application: req.params.id,
          sender: null,
          content: reply,
          language: language || 'auto',
          role: 'assistant',
          isAI: true
        });
      } catch (e) {
        // ignore AI failure
      }
    }

    return res.status(201).json({ message, aiMessage });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to send message' });
  }
};

module.exports = { listMessages, sendMessage }; 