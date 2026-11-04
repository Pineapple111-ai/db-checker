import "server-only";
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function loadKey(envName: string): Buffer {
  const value = process.env[envName];
  if (!value) {
    throw new Error(`환경변수 ${envName} 가 설정되지 않았습니다.`);
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error(`${envName} 는 32바이트 base64 키여야 합니다.`);
  }
  return key;
}

/** 현재 암호화에 사용할 키 버전 */
export function currentKeyVersion(): number {
  const v = Number(process.env.DATA_KEY_VERSION ?? "1");
  if (!Number.isInteger(v) || v < 1) {
    throw new Error("DATA_KEY_VERSION 값이 올바르지 않습니다.");
  }
  return v;
}

/**
 * 버전별 암호화 키
 * v1 → DATA_ENCRYPTION_KEY
 * v2 이상 → DATA_ENCRYPTION_KEY_V2, DATA_ENCRYPTION_KEY_V3 ...
 * (키 교체 시 새 키를 추가하고 DATA_KEY_VERSION만 올리면 기존 데이터도 복호화 가능)
 */
function encryptionKey(version: number): Buffer {
  return loadKey(version === 1 ? "DATA_ENCRYPTION_KEY" : `DATA_ENCRYPTION_KEY_V${version}`);
}

/** 평문 → "v1:iv:tag:ciphertext" (모두 base64) */
export function encrypt(plain: string): string {
  const version = currentKeyVersion();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(version), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${version}`,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || !parts[0].startsWith("v")) {
    throw new Error("암호문 형식이 올바르지 않습니다.");
  }
  const version = Number(parts[0].slice(1));
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(version), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function encryptNullable(plain: string | null | undefined): string | null {
  return plain ? encrypt(plain) : null;
}

export function decryptNullable(payload: string | null | undefined): string | null {
  return payload ? decrypt(payload) : null;
}

/**
 * 연락처 중복 판정용 검색 키
 * 입력은 반드시 정규화된 번호(01012345678, 하이픈 없음)
 * PHONE_HMAC_KEY는 절대 교체 금지 (교체 시 기존 중복 검사 전부 무효)
 */
export function phoneLookupKey(normalizedDigits: string): string {
  if (!/^010\d{8}$/.test(normalizedDigits)) {
    throw new Error("정규화되지 않은 연락처로 검색 키를 만들 수 없습니다.");
  }
  return crypto
    .createHmac("sha256", loadKey("PHONE_HMAC_KEY"))
    .update(`phone:${normalizedDigits}`)
    .digest("hex");
}

/** 로그인 실패 기록용 이메일 해시 (원문 이메일 저장 방지) */
export function emailHash(email: string): string {
  return crypto
    .createHmac("sha256", loadKey("PHONE_HMAC_KEY"))
    .update(`email:${email.trim().toLowerCase()}`)
    .digest("hex");
}