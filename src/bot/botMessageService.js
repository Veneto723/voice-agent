// src/bot/botMessageService.js
import { query, getPool } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { encode, isWav } from "silk-wasm";
import { callWechatBotApi } from "../utils/utils.js";
import { uploadSilkBuffer, signUrl } from "../utils/ossHandler.js";
import axios from "axios";

export class BotMessageService {
    constructor(asrClient, ttsClient) {
        this.asrClient = asrClient;
        this.ttsClient = ttsClient;
    }

    /**
     * Handle incoming text message
     * @param {Object} Data - Raw message data
     * @param {Object} bot - Bot
     * @returns {Promise<string|null>} message content or null if ignored
     */
    async handleTextMessage(Data, bot) {
        const fromUser = Data.FromUserName?.string;
        const toUser = Data.ToUserName?.string;
        const content = Data.Content?.string;

        if (!fromUser || !toUser || !content || !bot) return null;

        // ignore group message
        if (fromUser.endsWith("@chatroom")) return null;

        if (content === "@统计") {
            try {
                const { rows } = await query(
                    `SELECT COUNT(*)::int AS cnt
                     FROM sessions
                     WHERE status = 'completed'
                       AND ended_at IS NOT NULL
                       AND ended_at >= (
                         date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::timestamp)
                         AT TIME ZONE 'Asia/Shanghai'
                       )`,
                    []
                );
                const n = rows?.[0]?.cnt ?? 0;
                await this.sendReply(bot, fromUser, `本周一共${n}次车辆来访` );
            } catch (e) {
                console.error(`[BOT ${bot.wxid}] @统计 error:`, e);
                await this.sendReply(bot, fromUser, "统计暂不可用，请稍后再试");
            }
            return null;
        }

        console.log(`[BOT ${bot.wxid}] Incoming text message from contact ${fromUser}:`, content);
        return content;
    }

    /**
     * Handle incoming voice message
     * 1. Call API to get fileUrl
     * 2. Send fileUrl to ASR to recognize text
     * @param {Object} Data
     * @param {Object} bot
     * @returns {Promise<string|null>} recognized text or null
     */
    async handleVoiceMessage(Data, bot) {
        const msgId = Data.MsgId;
        let xml = Data.Content?.string;
        const fromUser = Data.FromUserName?.string;

        if (!msgId || !xml || !bot) return null;

        try {
            // Step 1: Get the file URL from
            const resp = await callWechatBotApi(process.env.WECHAT_BOT_DOWNLOAD_VOICE_URL, bot.token, { msgId, xml });

            const fileUrl = resp.data?.data?.fileUrl;

            if (!fileUrl) {
                console.error("[VOICE] No fileUrl in response:", resp.data);
                return null;
            }

            // Step 2: Call Tencent Cloud ASR
            const params = {
                EngSerViceType: "16k_zh",
                SourceType: 0,
                Url: fileUrl,
                VoiceFormat: "silk",
                FilterPunc: 1,
                HotwordId: process.env.TENCENT_HOTWORD_ID
            };

            const asrResp = await this.asrClient.SentenceRecognition(params);
            const text = (asrResp?.Result ?? "").trim();

            if (!text) {
                await callWechatBotApi(process.env.WECHAT_BOT_SEND_TEXT_URL, bot.token, {
                    toWxid: fromUser,
                    content: '抱歉我没有听清，请麻烦再说一次'
                });
                return null;
            }

            console.log(`[BOT ${bot.wxid}] Incoming voice message from ${fromUser}:`, text);

            return text;
        } catch (err) {
            console.error(`[BOT ${bot.wxid}] Voice message error:`, err);
            return null;
        }
    }

    /**
     * Handle new friend
     * @param {Object} Data
     * @param {Object} bot
     */
    async handleNewFriend(Data, bot) {
        const fromUser = Data.FromUserName?.string;
        const toUser = Data.ToUserName?.string;
        const content = Data.Content?.string;

        if (!bot || !fromUser) return;

        if (content !== '以上是打招呼的消息') return;
        if (toUser !== bot.wxid) return;

        // Mark the user as allowed to chat after accepting the friend request.
        if (!(bot.visitors instanceof Set)) bot.visitors = new Set();
        bot.visitors.add(fromUser);

        console.log(`[BOT ${bot.wxid}] New friend accepted: ${fromUser}`);
    }

    async getAIReply(visitorId, userMessage, sessionId) {
        try {
          const payload = {
            session_id: sessionId,
            bot_app_key: process.env.AGENT_APP_KEY,
            visitor_biz_id: visitorId,
            content: userMessage,
            stream: "disable",
            search_network: "disable",
            workflow_status: "disable",
            tcadp_user_id: ""
          };

          const response = await axios.post(
            "https://wss.lke.cloud.tencent.com/v1/qbot/chat/sse",
            payload,
            {
              headers: { "Content-Type": "application/json" }
            }
          );
          const lines = response.data.split(/\r?\n/);
          let finalReply = "";

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.startsWith("data:")) continue;

            const rawJson = line.replace(/^data:/, "").trim();
            try {
              const json = JSON.parse(rawJson);

              if (json.type === "reply") {
                const payload = json.payload || {};
                if (!payload.is_from_self && payload.is_final) {
                  finalReply = payload.content;
                  break; // stop after the final reply
                }
              }
            } catch (err) {
              console.error("[AI] Failed to parse JSON line:", err.message);
            }
          }

          return finalReply;
        } catch (err) {
          console.error("Failed to get AI reply:", err.message);
          return "AI生成回复失败";
        }
      }

    /**
     * TTS (base64 WAV) → SILK → OSS; returns a time-limited signed URL and duration.
     * @param {string} text
     * @returns {Promise<{ signedUrl: string, durationMs: number, objectKey: string }|null>}
     */
    async generateTts(text) {
        const trimmed = typeof text === "string" ? text.trim() : "";
        if (!trimmed || !this.ttsClient) return null;

        const sessionId = uuidv4();
        const voiceType = Number(process.env.TENCENT_TTS_VOICE_TYPE);
        const objectKey = `voice/${sessionId}.silk`;

        const params = {
            Text: trimmed,
            SessionId: sessionId,
            VoiceType: voiceType,
            Codec: "wav",
        };

        const ttsResp = await this.ttsClient.TextToVoice(params);
        const audioB64 = ttsResp?.Audio ?? "";
        if (!audioB64) return null;

        const wavBuf = Buffer.from(audioB64, "base64");
        if (!isWav(wavBuf)) {
            throw new Error("[TTS] response is not WAV");
        }

        const { data, duration } = await encode(wavBuf, 0);
        const silk = Buffer.from(data);

        await uploadSilkBuffer(objectKey, silk);
        const signedUrl = signUrl(objectKey);
        if (!signedUrl) {
            throw new Error("[TTS] failed to sign OSS URL");
        }

        return { signedUrl, duration };
    }

    /**
     * Send long AI reply in human-like chunks
     * @param {Object} bot - Bot
     * @param {string} toWxid - receipent
     * @param {string} content
     */
    async sendReply(bot, toWxid, content) {
        if (!bot || !toWxid || !content.trim()) return;
        console.log('Send Reply with', content.trim())
        await callWechatBotApi(process.env.WECHAT_BOT_SEND_TEXT_URL, bot.token, { toWxid, content: content.trim() });
    }

    async sendVoiceReply(bot, toWxid, content) {
        if (!bot || !toWxid || !content.trim()) return;

        const {signedUrl, duration} = await this.generateTts(content.trim())

        await callWechatBotApi(process.env.WECHAT_BOT_SEND_VOICE_URL, bot.token, { toWxid, voiceUrl: signedUrl, voiceDuration: duration });
    }

    /**
     * Get a session for a given visitor.
     * @param {string} wxid
     * @returns {Promise<Object>} session object
     */
    async getSession(wxid) {
        const result = await query(
            `SELECT * FROM sessions WHERE wxid = $1 ORDER BY started_at DESC LIMIT 1`,
            [wxid]
        );
        return result.rows?.[0];
    }

    /**
     * Create a new session for a given visitor.
     * @param {string} wxid
     * @returns {Promise<Object>} session object
     */
    async createSession(wxid) {
        const result = await query(
            "INSERT INTO sessions (id, wxid, status) VALUES ($1, $2, $3) RETURNING *",
            [uuidv4(), wxid, "collecting"]
        );

        return result.rows?.[0];
    }

    /**
     * Mark the collecting session completed with plate, company, and reason.
     * Runs in a single transaction.
     *
     * @param {string} wxid
     * @param {string} plate
     * @param {string} company
     * @param {string} reason
     * @param {Object} session
     */
    async completeSession(wxid, plate, company, reason, session) {
        const plateNorm = plate.trim();
        const pool = getPool();
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const lock = await client.query(
                `SELECT id FROM sessions
                     WHERE id = $1 AND wxid = $2 AND status = 'collecting'
                     FOR UPDATE`,
                [session.id, wxid]
            );

            if (!lock.rows?.[0]) {
                await client.query("ROLLBACK");
                console.warn(`Session does not exist for wxid=${wxid}`);
                return null;
            }

            await client.query(
                `UPDATE sessions
                 SET plate = $1,
                     company = $2,
                     reason = $3,
                     status = 'completed',
                     ended_at = now()
                 WHERE id = $4 AND wxid = $5`,
                [plateNorm, company, reason, session.id, wxid]
            );

            await client.query(
                `INSERT INTO visitors (wxid, plate) VALUES ($1, $2)
                 ON CONFLICT (wxid) DO UPDATE SET plate = EXCLUDED.plate`,
                [wxid, plateNorm]
            );

            await client.query("COMMIT");
        } catch (e) {
            try {
                await client.query("ROLLBACK");
            } catch (_) { }
            console.error("[completeSession] error:", e);
            throw e;
        } finally {
            client.release();
        }
    }
}