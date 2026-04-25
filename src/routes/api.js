import express from "express";
import { sendWeComGroupText } from "../utils/wecomWebhook.js";
import { standardResponse } from "../utils/utils.js";
import twilio from "twilio";

const router = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

router.get("/health", async(req, res) => {
  return standardResponse(res, 200, "ok");
});

router.post("/twilio/voice", async (req, res) => {
  const twiml = new VoiceResponse();

  twiml.say('你好，欢迎使用Voice Agent智能语音AI访客登记系统。');

  res.type('text/xml');
  res.send(twiml.toString());
});

router.post("/notify", async (req, res) => {
  const { content } = req.body;

  if (!content || typeof content !== "string") {
    return standardResponse(res, 400, "content (string) required");
  }

  try {
    const data = await sendWeComGroupText(content);
    return standardResponse(res, 200, "ok", { wecom: data });
  } catch (e) {
    return standardResponse(res, 500, e.message, { detail: e.detail });
  }
});

export default router;