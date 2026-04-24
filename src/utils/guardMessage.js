// src/utils/guardMessage.js

import { formatTime } from "./utils.js";

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
export function buildGuardMessage(visit) {
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

