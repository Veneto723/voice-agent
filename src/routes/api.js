import "dotenv/config";
import express from "express";
import {sendWeComGroupText} from "../utils/wecomWebhook.js";
import {standardResponse} from "../utils/utils.js";
import {redis} from "../utils/redisClient.js";
import { query } from "../db.js";

const router = express.Router();

router.get("/health", async (req, res) => {
  return standardResponse(res, 200, "ok");
});

router.post("/test-voice", async (req, res) => {
  const {content} = req.body;
  if (!content || typeof content !== "string" || !content.trim()) {
    return standardResponse(res, 400, "content (non-empty string) required");
  }
  try {
    await redis.publish(
      'bot:control',
      JSON.stringify({
        action: "generateTts",
        content: content,
      })
    );
    return standardResponse(res, 200, "ok");
  } catch (e) {
    return standardResponse(res, 500, e.message);
  }
})

router.post("/scan-plate", async (req, res) => {
  const {plate} = req.body;

  if (!plate || typeof plate !== "string" || !plate.trim()) {
    return standardResponse(res, 400, "plate (non-empty string) required");
  }

  try {
    const normalized = plate.trim();

    const result = await query(
      `SELECT wxid FROM visitors WHERE UPPER(plate) = UPPER($1::text) LIMIT 1`,
      [normalized]
    );

    const wxid = result.rows?.[0]?.wxid ?? null;

    if (!wxid) {
      return standardResponse(res, 404, "plate not registered");
    }

    const lastSession = await query(
      `SELECT * FROM sessions WHERE wxid = $1 ORDER BY started_at DESC LIMIT 1`,
      [wxid]
    )
    const session = lastSession.rows?.[0] ?? null;

    await redis.publish(
      'bot:control',
      JSON.stringify({
        action: "scanPlate",
        plate: normalized,
        wxid: wxid,
        session: session,
      })
    );
    return standardResponse(res, 200, "ok");

  } catch (e) {
    return standardResponse(res, 500, e.message || "publish failed");
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