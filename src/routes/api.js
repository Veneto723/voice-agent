import "dotenv/config";
import express from "express";
import {sendWeComGroupText} from "../utils/wecomWebhook.js";
import {standardResponse} from "../utils/utils.js";
import {redis} from "../utils/redisClient.js";

const router = express.Router();

router.get("/health", async (req, res) => {
  return standardResponse(res, 200, "ok");
});

router.post("/scan-plate", async (req, res) => {
  const {plate} = req.body;

  if (!plate || typeof plate !== "string" || !plate.trim()) {
    return standardResponse(res, 400, "plate (non-empty string) required");
  }

  try {
    await redis.publish(
      'bot:control',
      JSON.stringify({
        action: "scanPlate",
        plate: plate.trim()
      })
    );
    return standardResponse(res, 200, "ok", {plate: plate.trim()});

  } catch (e) {
    return standardResponse(res, 500, e.message || "publish failed", {});
  }
});

router.post("/notify", async (req, res) => {
  const {content} = req.body;

  if (!content || typeof content !== "string") {
    return standardResponse(res, 400, "content (string) required");
  }

  try {
    const data = await sendWeComGroupText(content);
    return standardResponse(res, 200, "ok", {wecom: data});
  } catch (e) {
    return standardResponse(res, 500, e.message, {detail: e.detail});
  }
});

export default router;