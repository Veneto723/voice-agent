// src/utils/utils.js
import axios from "axios";

export const standardResponse = (res, code, msg, data = {}) => {
    res.status(code).json({
        code: code,
        msg: msg,
        data: data,
    });
};

/**
 * 格式化时间
 * @param {Date} date 时间
 * @returns {string} 格式化后的时间
 */
export const formatTime = (date) => {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
};

/**
 * 调用 Wechat Bot API
 * @param {string} token - 令牌
 * @param {string} url - 请求URL
 * @param {Object} data - 请求数据
 * @returns {Promise<Object>} 响应数据
 */
export const callWechatBotApi = async (url, token, data) => {
	try {
		const resp = await axios.post(url, data, { headers: { AUTHORIZATION: token, "Content-Type": "application/json" }, timeout: 0 });
//		console.log('Successfully sent API request with resp:', resp.data);
		return resp;
	} catch (err) {
		console.error(`Failed to send API request:`, err.message);
		throw err;
	}
}

/**
 * 生成推送给保安的完整访客消息
 *
 * @param {object} visit
 * @param {string} visit.plate 车牌号（例如：沪A12345）
 * @param {string} visit.company 来访单位/拜访公司
 * @param {string} visit.phone 联系手机号
 * @param {string} visit.reason 来访事由（送货/面试/拜访等）
 * @param {Date} [visit.entryTime] 入场时间
 */
export const buildGuardMessage = (visit) => {
  const plate = String(visit?.plate ?? "").trim();
  const company = String(visit?.company ?? "").trim();
  const phone = String(visit?.phone ?? "").trim();
  const reason = String(visit?.reason ?? "").trim();
  const entryTime = visit?.entryTime ?? new Date();

  const lines = [
    "【访客登记】",
    `入场时间：${formatTime(entryTime)}`,
    `车牌号：${plate || "-"}`,
    `拜访单位：${company || "-"}`,
    `联系电话：${phone || "-"}`,
    `来访事由：${reason || "-"}`,
  ];

  return lines.join("\n");
}
