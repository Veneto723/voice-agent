// src/bot/botMessageService.js
import {query} from "../db.js";
import {v4 as uuidv4} from "uuid";
import {callWechatBotApi} from "../utils/utils.js";

export class BotMessageService {
    constructor(asrClient) {
        this.asrClient = asrClient;
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
            const resp = await callWechatBotApi(process.env.WECHAT_BOT_DOWNLOAD_VOICE_URL, bot.token, {msgId, xml});

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
     * Send long AI reply in human-like chunks
     * @param {Object} bot - Bot
     * @param {string} toWxid - receipent
     * @param {string} content
     */
    async sendReply(bot, toWxid, content) {
        if (!bot || !toWxid || !content.trim()) return;

        await callWechatBotApi(process.env.WECHAT_BOT_SEND_TEXT_URL, bot.token, {toWxid, content});
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
}