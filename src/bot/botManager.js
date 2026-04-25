// src/bot/botManager.js
import WebSocket from "ws";

const HEARTBEAT_INTERVAL = 60_000; // 60s interval for WebSocket heartbeat
const TEXT_MSG_TYPE = 1;           // WeChat text message type
const VOICE_MSG_TYPE = 34;         // WeChat voice message type
const ACCEPTANCE_MSG_TYPE = 10000  // WeChat friend-accept message type

class BotManager {
  /**
   * Initialize a new BotManager instance
   * @param {Object} asrClient - Tencent Cloud ASR client
   * @param {Object} messageService - Service instance responsible for sending, receiving,
   *                                  and managing bot-related messages.
   */
  constructor(asrClient, messageService) {
    this.bot = null;
    this.ws = null;
    this.heartbeatInterval = null;
    this.asrClient = asrClient;
    this.messageService = messageService;
  }

  /**
   * Start a bot, connect to WebSocket, and handle messages
   * @param {Object} bot - Bot info from database
   */
  async startBot(bot) {
    if (!bot) return;

    const wxid = bot.wxid;
    if (!wxid) throw new Error("bot.wxid is required");

    // demo only: only one bot can run at a time.
    if (this.bot) return;
    this.bot = bot;

    const connect = () => {
      const ws = new WebSocket(process.env.WECHAT_BOT_URL);
      this.ws = ws;

      ws.on("open", () => {
        ws.send(JSON.stringify({robotid: wxid}));
        console.log(`Bot ${wxid} connected.`);

        // Start heartbeat
        this.heartbeatInterval = setInterval(() => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: "heartbeat",
              robotid: wxid,
              timestamp: Date.now()
            }));
          }
        }, HEARTBEAT_INTERVAL);
      });

      // Handle incoming WebSocket messages
      ws.on("message", (msg) => {
        this.handleMessage(msg);
      });

      ws.on("close", () => {
        console.log(`Bot ${wxid} disconnected.`);
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
        this.ws = null;
        this.bot = null;
      });

      ws.on("error", (err) => {
        console.error(`Bot ${wxid} error: `, err.message);
      });
    };

    connect();
  }

  /**
   * Handle a WebSocket message
   * @param {string} message
   */
  async handleMessage(message) {
    const bot = this.bot;
    if (!bot) return;

    let msgStr = message.toString();
    let parsed;
    try {
      parsed = JSON.parse(msgStr);
      console.log(`Bot receive message:`, parsed);
    } catch {
      return; // ignore non-json incoming msg
    }

    // Only process AddMsg events
    if (parsed.TypeName !== "AddMsg") return;

    const {Data} = parsed;
    const fromUser = Data.FromUserName.string;

    // Step 1: Determine message type and extract message content
    if (Data.MsgType === ACCEPTANCE_MSG_TYPE) {
      await this.messageService.handleNewFriend(Data, bot)

      const replyContent = "您好，我是园区访客登记助手。请直接发送：车牌号、拜访公司、来访事由（可发语音）。";
      await this.messageService.sendReply(bot, fromUser, replyContent);
      return;
    }

    const allowed = bot.visitors instanceof Set && bot.visitors.has(fromUser);
    if (!allowed) return;

    let content;
    if (Data.MsgType === TEXT_MSG_TYPE) {
      content = await this.messageService.handleTextMessage(Data, bot);
    } else if (Data.MsgType === VOICE_MSG_TYPE) {
      content = await this.messageService.handleVoiceMessage(Data, bot);
    } else {
      return; // unsupported type
    }

    if (!content) return;

    // Step 2: generate AI reply
    // const reply = await this.messageService.getAIReply(bot.app_key, fromUser, content, sessionId);

    // Step 3: send back reply
    // await this.messageService.sendReply(bot, fromUser, reply, Data, sessionId);
  }

  /**
   * Handle a plate scan event
   * @param {string} plate - the plate number to scan
   */
  async handleScanPlate(plate) {
    // TODO: implement this function to handle the plate scan event
    // we need to check if the plate is in the database
    // if it is, we need to send a message to the visitor
    // if it is not, we need to send a message to the visitor
  }
}

export {BotManager};