// src/utils/ossHandler.js
import OSS from "ali-oss";

function ossBaseConfig() {
  const region = process.env.OSS_REGION;
  const bucket = process.env.OSS_BUCKET;
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  if (!region || !bucket || !accessKeyId || !accessKeySecret) {
    throw new Error(
      "OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET are required"
    );
  }
  return { region, bucket, accessKeyId, accessKeySecret };
}

/** VPC / internal uploads. Override with OSS_ENDPOINT_INTERNAL. */
function internalEndpoint() {
  const region = process.env.OSS_REGION;
  return (
    process.env.OSS_ENDPOINT_INTERNAL ||
    `https://${region}-internal.aliyuncs.com`
  );
}

/** Public endpoint for signatureUrl. Override with OSS_ENDPOINT. */
function publicEndpoint() {
  const region = process.env.OSS_REGION;
  return process.env.OSS_ENDPOINT || `https://${region}.aliyuncs.com`;
}

let _uploadClient = null;
let _signedClient = null;

export function getUploadClient() {
  if (!_uploadClient) {
    _uploadClient = new OSS({
      ...ossBaseConfig(),
      endpoint: internalEndpoint(),
    });
  }
  return _uploadClient;
}

function getSignedClient() {
  if (!_signedClient) {
    _signedClient = new OSS({
      ...ossBaseConfig(),
      endpoint: publicEndpoint(),
    });
  }
  return _signedClient;
}

/**
 * @param {string} key - OSS object key
 * @param {number} [expires]
 */
export const signUrl = (key, expires = 3600) =>
  key ? getSignedClient().signatureUrl(key, { expires }) : null;

/**
 * Upload raw SILK bytes. OSS only stores bytes; the filename is the object key (e.g. …/uuid.silk).
 * @param {string} objectKey - e.g. voice/tts/{sessionId}.silk
 * @param {Buffer|Uint8Array} buffer
 * @returns {Promise<object>} ali-oss put result (includes url/name)
 */
export async function uploadSilkBuffer(objectKey, buffer) {
  if (!objectKey || !buffer?.length) {
    throw new Error("uploadSilkBuffer: objectKey and non-empty buffer required");
  }
  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return getUploadClient().put(objectKey, body, {
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });
}