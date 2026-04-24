// routes/external.js
import express from 'express';

const router = express.Router();

router.get('/health', async (_req, res) => {
  res.status(200).send('ok');
});

router.post('/twilio/voice', async (req, res) => {
  const voice = process.env.TWILIO_VOICE || 'alice';
  const language = process.env.TWILIO_LANGUAGE || 'zh-CN';

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${language}">您好，这里是园区门岗。请问您车牌号是多少？</Say>
</Response>`;

  res.status(200).type('text/xml').send(twiml);
});


export default router;