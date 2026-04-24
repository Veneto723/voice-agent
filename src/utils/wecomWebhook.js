// src/utils/wecomWebhook.js

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * 企业微信Webhook错误
 */
class WeComWebhookError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "WeComWebhookError";
    this.detail = detail;
  }
}

/**
 * 发送企业微信群文本消息
 * @param {string} content 消息内容
 * @returns {Promise<object>} 企业微信响应数据
 */
export async function sendWeComGroupText(content) {
  if (!content || typeof content !== "string") {
    throw new Error("content must be a non-empty string");
  }
  
  const WEBHOOK_URL = process.env.WECOM_WEBHOOK_URL;
  if (!WEBHOOK_URL) {
    throw new Error("Missing WECOM_WEBHOOK_URL");
  }

  const body = {
    msgtype: "text",
    text: { content },
  };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });

    const data = await res.json().catch(() => {
      throw new WeComWebhookError("Response is not JSON", { status: res.status });
    });

    if (!res.ok) {
      throw new WeComWebhookError(`HTTP ${res.status}`, data);
    }

    if (data?.errcode && data.errcode !== 0) {
      throw new WeComWebhookError(data.errmsg || "WeCom Webhook error", data);
    }

    return data;
  } finally {
    clearTimeout(t);
  }
}
