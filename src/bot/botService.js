// src/bot/wechatBotService.js
import tencentcloud from "tencentcloud-sdk-nodejs";
import { BotManager } from "./botManager.js";
import { BotMessageService } from "./botMessageService.js";
import { query } from "../db.js";
import dotenv from "dotenv";
import { sub } from "../utils/redisClient.js";

dotenv.config();

console.log("WeChat Bot Service starting...");

const AsrClient = tencentcloud.asr.v20190614.Client;
const TtsClient = tencentcloud.tts.v20190823.Client;

const asrClient = new AsrClient({
  credential: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY
  },
  region: "ap-shanghai",
  profile: {
    httpProfile: { endpoint: "asr.tencentcloudapi.com" }
  }
});

const ttsClient = new TtsClient({
  credential: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY
  },
  region: "ap-shanghai",
  profile: {
    httpProfile: { endpoint: "tts.tencentcloudapi.com" }
  }
})

const messageService = new BotMessageService(asrClient, ttsClient);
const botManager = new BotManager(asrClient, messageService);

// subscribe redis
await sub.subscribe("bot:control");

sub.on("message", async (channel, message) => {
    if (channel !== "bot:control") return;

    try {
      const data = JSON.parse(message);
      console.log("Bot control event:", data);

      switch (data.action) {
        case "scanPlate":
          await botManager.handleScanPlate(data);
          break;
        case "generateTts":
          await botManager.handleGenerateTts(data);
          break;
      }
    } catch (err) {
      console.error("Redis message error:", err);
    }
  });

// start bot
async function bootstrapBots() {
    const result = await query("SELECT * FROM visitors");
    const visitors = new Set((result.rows ?? []).map((r) => r.wxid).filter(Boolean));

    const bot = {
        wxid: process.env.WECHAT_WXID,
        token: process.env.WECHAT_TOKEN,
        visitors: visitors,
    }

    await botManager.startBot(bot);
}

await bootstrapBots();

// graceful shutdown
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  console.log("Shutting down bot service...");
  process.exit(0);
}