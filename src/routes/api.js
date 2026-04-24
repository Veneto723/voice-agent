import express from "express";
import { sendWeComGroupText } from "../utils/wecomWebhook.js";
import { standardResponse } from "../utils/utils.js";

const router = express.Router();

router.get("/health", async(req, res) => {
  return standardResponse(res, 200, "ok");
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