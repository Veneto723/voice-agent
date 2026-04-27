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

      // create a new session for the new visitor
      await this.messageService.createSession(fromUser);
      const replyContent = "您好，我是园区访客登记助手。请直接发送：手机号、车牌号、拜访公司、来访事由（可发语音）。";
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
    const session = await this.messageService.getSession(fromUser);
    const reply = await this.messageService.getAIReply(bot, fromUser, content, session);

    // Step 3: send back reply
//    await this.messageService.sendVoiceReply(bot, fromUser, reply);
    await this.messageService.sendReply(bot, fromUser, reply);
  }

  /**
   * Handle a plate scan event
   * @param {Object} payload - the payload from the API
   */
  async handleScanPlate(payload) {
    const bot = this.bot;
    if (!bot) {
      console.warn("[scanPlate] bot not connected.");
      return;
    }

    const { plate, wxid, session: prevSession } = payload ?? {};

    if (!plate || !wxid) {
      console.warn("[scanPlate] missing plate or wxid info", payload);
      return;
    }

    const newSession = await this.messageService.createSession(wxid);

    const p = prevSession && typeof prevSession === "object" ? prevSession : null;
    const company = p?.company != null ? String(p.company).trim() : "";
    const reason = p?.reason != null ? String(p.reason).trim() : "";
    const phone = p?.phone != null ? String(p.phone).trim() : "";
    const lastPlate = p?.plate != null ? String(p.plate).trim() : "";
    const hasHistory = Boolean(company || reason || phone || lastPlate);

    let gateMessage;
    if (!hasHistory) {
      gateMessage =
        `【系统消息·闸机识别】已识别当前入场车辆车牌：${String(plate).trim()}。` +
        "该访客暂无可复用的历史登记。请向用户简要说明，并引导其完成拜访公司、来访事由、手机号等登记；用户可发语音。";
    } else {
      gateMessage =
        `【系统消息·闸机识别】已识别车牌：${String(plate).trim()}。` +
        `该访客此前在系统中留存的登记信息为：拜访单位「${company || "（未填）"}」，` +
        `来访事由「${reason || "（未填）"}」，手机「${phone || "（未填）"}」，车牌「${
          lastPlate || String(plate).trim()
        }」。` +
        "请用自然、友好的话向用户确认本次是否仍按上述信息办理；若需修改，请据对话继续登记。";
    }

    const reply = await this.messageService.getAIReply(bot, wxid, gateMessage, newSession);
    await this.messageService.sendReply(bot, wxid, reply);
  }

  async handleGenerateTts(payload) {
    const {signedUrl, duration} = await this.messageService.generateTts(payload.content);
    console.log(signedUrl, duration);
  }
}

export {BotManager};