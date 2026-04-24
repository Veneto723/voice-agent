// src/utils/utils.js

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