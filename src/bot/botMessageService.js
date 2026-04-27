// src/bot/botMessageService.js
import { query, getPool } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { encode, isWav } from "silk-wasm";
import { callWechatBotApi } from "../utils/utils.js";
import { uploadSilkBuffer, signUrl } from "../utils/ossHandler.js";
import { buildGuardMessage } from "../utils/utils.js";
import { sendWeComGroupText } from "../utils/wecomWebhook.js";
import axios from "axios";

/**
 * Parse agent JSON from model output (raw JSON or fenced ```json ... ```).
 * @param {string} content
 * @returns {object|null}
 */
export function parseAgentJson(content) {
    if (!content || typeof content !== "string") return null;
    let s = content.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
        return JSON.parse(s.slice(start, end + 1));
    } catch {
        return null;
    }
}

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
        const pushContent = Data.PushContent;

        if (!fromUser || !toUser || !content || !bot || !pushContent) return null;

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

    /**
     * LKE chat → safe JSON parse → optional completeSession when status is complete.
     * @param {Object} bot
     * @param {string} visitorId - wxid
     * @param {string} userMessage
     * @param {{ id: string, status?: string }} session - DB session row
     * @returns {Promise<string>} reply text for WeChat (reply_to_user or raw fallback)
     */
    async getAIReply(bot, visitorId, userMessage, session) {
        if (!session?.id) {
            return "系统未找到登记会话，请稍后再试";
        }

        let finalReply = "";
        try {
            const payload = {
                session_id: session.id,
                bot_app_key: process.env.AGENT_APP_KEY,
                visitor_biz_id: visitorId,
                content: userMessage,
                stream: "disable",
                search_network: "disable",
                workflow_status: "disable",
                tcadp_user_id: "",
            };

            const response = await axios.post(
                "https://wss.lke.cloud.tencent.com/v1/qbot/chat/sse",
                payload,
                {
                    headers: { "Content-Type": "application/json" },
                }
            );
            const lines = response.data.split(/\r?\n/);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line.startsWith("data:")) continue;

                const rawJson = line.replace(/^data:/, "").trim();
                try {
                    const json = JSON.parse(rawJson);

                    if (json.type === "reply") {
                        const pl = json.payload || {};
                        if (!pl.is_from_self && pl.is_final) {
                            finalReply = pl.content ?? "";
                            break;
                        }
                    }
                } catch (err) {
                    console.error("[AI] Failed to parse JSON line:", err.message);
                }
            }
        } catch (err) {
            console.error("Failed to get AI reply:", err.message);
            return "AI 生成回复失败，请稍后再试";
        }

        const parsed = JSON.parse(finalReply.trim());
        console.log(parsed);
        let replyText = parsed?.reply_to_user || '';

        if (session.status === "collecting" &&
            String(parsed.status || "").toLowerCase() === "complete" &&
            parsed.data && typeof parsed.data === "object"
        ) {
            const d = parsed.data;
            const plate = d.plate != null ? String(d.plate).trim() : "";
            const company = d.company != null ? String(d.company).trim() : "";
            const reason = d.reason != null ? String(d.reason).trim() : "";
            const phone = d.phone != null ? String(d.phone).trim() : "";
            if (plate && company && reason && phone) {
                try {
                    const done = await this.completeSession(visitorId, plate, company, reason, phone, session);

                        try {
                            const templateMsg = buildGuardMessage({ ...done, entryTime: new Date() });
                            await sendWeComGroupText(templateMsg);
                            await this.sendReply(bot, visitorId, templateMsg);
                        } catch (e) {
                            console.error("[wecom] notify guard failed:", e.message);
                        }
                } catch (e) {
                    console.error("[getAIReply] completeSession failed:", e.message);
                }
            } else {
                console.warn("[getAIReply] complete status but data incomplete", parsed.data);
            }
        }

        return replyText;
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
        const curr = result.rows?.[0];
        if (!curr || curr.status === "completed") {
            return await this.createSession(wxid);
        }
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
     * Mark the collecting session completed. Runs in a single transaction.
     *
     * @param {string} wxid
     * @param {string} plate
     * @param {string} company
     * @param {string} reason
     * @param {string} phone
     * @param {Object} session
     * @returns {Promise<{ plate: string, company: string, reason: string, phone: string }|null>}
     */
    async completeSession(wxid, plate, company, reason, phone, session) {
        const plateNorm = String(plate ?? "").trim();
        const co = String(company ?? "").trim();
        const re = String(reason ?? "").trim();
        const ph = String(phone ?? "").trim();
        if (!plateNorm || !co || !re || !ph) {
            console.warn("[completeSession] missing required field");
            return null;
        }

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
                     phone = $4,
                     status = 'completed',
                     ended_at = now()
                 WHERE id = $5 AND wxid = $6`,
                [plateNorm, co, re, ph, session.id, wxid]
            );

            await client.query(
                `INSERT INTO visitors (wxid, plate) VALUES ($1, $2)
                 ON CONFLICT (wxid) DO UPDATE SET plate = EXCLUDED.plate`,
                [wxid, plateNorm]
            );

            await client.query("COMMIT");
            return { plate: plateNorm, company: co, reason: re, phone: ph };
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