/**
 * 解密工具模块
 * 实现 Java 代码 gf.java / dk.java 中的解密算法
 */

import CryptoJS from 'crypto-js';

/**
 * Atbash 密码 + Caesar shift -3 的密钥派生
 * 对应 Java gf_tools.d(String) 方法
 * @param {string} input - 原始密钥（从 AndroidManifest.xml 的 meta-data 中获取）
 * @returns {string} 派生后的 DES 密钥
 */
export function deriveDesKey(input) {
  // Step 1: Atbash cipher — 反转字母表 a↔z, b↔y, c↔x ...
  let sb = '';
  for (const c of input) {
    if (c >= 'a' && c <= 'z') {
      sb += String.fromCharCode(122 - (c.charCodeAt(0) - 97));
    } else {
      sb += c;
    }
  }

  // Step 2: Caesar 移位 -3
  let sb2 = '';
  for (const c of sb) {
    if (c >= 'a' && c <= 'z') {
      sb2 += String.fromCharCode(((c.charCodeAt(0) - 97 - 3 + 26) % 26) + 97);
    } else {
      sb2 += c;
    }
  }

  return sb2;
}

/**
 * Uint8Array → CryptoJS WordArray
 */
function uint8ArrayToWordArray(u8arr) {
  const len = u8arr.length;
  const words = [];
  for (let i = 0; i < len; i++) {
    words[i >>> 2] |= (u8arr[i] & 0xff) << (24 - (i % 4) * 8);
  }
  return CryptoJS.lib.WordArray.create(words, len);
}

/**
 * CryptoJS WordArray → Uint8Array
 */
function wordArrayToUint8Array(wordArray) {
  const len = wordArray.sigBytes;
  const u8arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8arr[i] = (wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return u8arr;
}

/**
 * 派生密钥的 UTF-8 字节数组（取前 8 字节作为 DES 密钥）
 * 对应 Java gf.b(byte[]) 方法
 * @param {string} derivedKey - 派生后的密钥字符串
 * @returns {CryptoJS.lib.WordArray} 8 字节 DES 密钥
 */
function getDesKeyWordArray(derivedKey) {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(derivedKey);
  // 取前 8 字节
  const desKey = new Uint8Array(8);
  for (let i = 0; i < 8 && i < keyBytes.length; i++) {
    desKey[i] = keyBytes[i];
  }
  return uint8ArrayToWordArray(desKey);
}

/**
 * DES/ECB/PKCS5Padding 解密
 * @param {Uint8Array} encryptedData - 加密的字节数据
 * @param {string} derivedKey - 派生后的密钥字符串
 * @returns {Uint8Array} 解密后的字节数据
 */
function desDecrypt(encryptedData, derivedKey) {
  const keyWA = getDesKeyWordArray(derivedKey);
  const ciphertextWA = uint8ArrayToWordArray(encryptedData);

  const decrypted = CryptoJS.DES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: ciphertextWA }),
    keyWA,
    {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }
  );

  return wordArrayToUint8Array(decrypted);
}

/**
 * 以 18 进制解析 hex 字符串（允许 a-h 字母）
 * 对应 Java gf.a(String) 方法
 * @param {string} hexStr - 18 进制编码的字符串
 * @returns {Uint8Array} 解码后的字节
 */
function parseHexRadix18(hexStr) {
  const len = hexStr.length;
  const bytes = new Uint8Array(len / 2);
  for (let i = 0; i < len; i += 2) {
    const pair = hexStr.substring(i, i + 2);
    bytes[i / 2] = parseInt(pair, 18);
  }
  return bytes;
}

/**
 * 检查字符串是否匹配 18 进制 hex 格式 [0-9a-hA-H]+
 * 对应 Java isHexString 方法
 */
function isHexRadix18(str) {
  return /^[0-9a-hA-H]+$/.test(str);
}

/**
 * 解密单个文件的完整流程
 * 对应 Java Main.decryptFile 逻辑
 * @param {Uint8Array} encryptedBytes - 加密的文件字节数据
 * @param {string} derivedKey - 派生后的 DES 密钥
 * @returns {Uint8Array} 解密后的文件字节数据
 */
export function decryptFileBytes(encryptedBytes, derivedKey) {
  // Step 1: DES 解密原始字节
  const dec1 = desDecrypt(encryptedBytes, derivedKey);

  // Step 2: 尝试转为 UTF-8 字符串
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let decStr = decoder.decode(dec1);

  // Step 3: 检查是否为 18 进制 hex 字符串
  // 需要清理空字符再检查
  const cleanedStr = decStr.replace(/\0/g, '');
  if (isHexRadix18(cleanedStr)) {
    // Step 4: 18 进制解析为字节
    const hexBytes = parseHexRadix18(cleanedStr);
    // Step 5: 再次 DES 解密
    const dec2 = desDecrypt(hexBytes, derivedKey);
    return dec2;
  }

  return dec1;
}

/**
 * XOR 解密（对应 dk.java 的异或算法，暂不在此项目使用）
 * 保留以供将来扩展
 */
export function xorDecrypt(base64Str, key) {
  const raw = atob(base64Str);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i) ^ key.charCodeAt(i % key.length);
  }
  return new TextDecoder('utf-8').decode(bytes);
}
