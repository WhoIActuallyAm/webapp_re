/**
 * APK 处理工具模块
 * 负责：读取 APK (ZIP)、解析 AndroidManifest.xml、解密 assets/webapp 文件、生成输出 ZIP
 */

import JSZip from 'jszip';
import { getMetaDataValue } from './axmlParser.js';
import {
  deriveDesKey, decryptFileBytes,
  isGetrunEncrypted, extractGetrunPayload,
  gfBString, bytesSub2, hasGarbledChars
} from './decryptUtils.js';

// 需要解密的文件后缀
const DECRYPT_EXTENSIONS = /\.(html|js|css)$/i;

/**
 * 从 APK 文件中读取并解析 meta-data 值
 * @param {JSZip} zip - 已加载的 JSZip 实例
 * @param {string} targetName - meta-data name，默认 'main'
 * @returns {string|null} meta-data 的 value，没找到返回 null
 */
async function extractMetaDataValue(zip, targetName = 'main') {
  // AndroidManifest.xml 可能在根目录
  const manifestFile = zip.file('AndroidManifest.xml');
  if (!manifestFile) {
    console.warn('未找到 AndroidManifest.xml');
    return null;
  }

  const manifestData = new Uint8Array(await manifestFile.async('arraybuffer'));
  return getMetaDataValue(manifestData, targetName);
}

/**
 * 判断文件是否需要解密
 */
function shouldDecrypt(fileName) {
  return DECRYPT_EXTENSIONS.test(fileName);
}

/**
 * 仅检测 APK 中的 meta-data 口令（不解密文件）
 * @param {File|Blob} apkFile - 用户上传的 APK 文件
 * @returns {Promise<{ metaValue: string|null, found: boolean }>}
 */
export async function detectMetaData(apkFile) {
  try {
    const zip = await JSZip.loadAsync(apkFile);
    const metaValue = await extractMetaDataValue(zip, 'main');
    return { metaValue, found: !!metaValue };
  } catch {
    return { metaValue: null, found: false };
  }
}

/**
 * 检测 APK 中文件的加密类型
 * @param {File|Blob} apkFile - 用户上传的 APK 文件
 * @returns {Promise<{ type: 'getrun'|'fullaes', assetFiles: string[], metaValue: string|null }>}
 */
export async function detectEncryptionType(apkFile) {
  try {
    const zip = await JSZip.loadAsync(apkFile);

    // 获取 assets/ 下所有 html/js 文件（排除 webapp 目录）
    const assetFiles = Object.keys(zip.files).filter(
      (name) => name.startsWith('assets/') && !name.startsWith('assets/webapp/') && !zip.files[name].dir
        && /\.(html|js)$/i.test(name)
    );

    // 检测 getrun 特征
    let getrunMatchCount = 0;
    for (const filePath of assetFiles) {
      const fileData = await zip.files[filePath].async('text');
      if (isGetrunEncrypted(fileData)) {
        getrunMatchCount++;
      }
    }

    const metaValue = await extractMetaDataValue(zip, 'main');

    if (getrunMatchCount >= 2) {
      return { type: 'getrun', assetFiles, metaValue };
    }
    return { type: 'fullaes', assetFiles, metaValue };
  } catch {
    return { type: 'fullaes', assetFiles: [], metaValue: null };
  }
}

/**
 * 处理 APK 文件：解密 assets/webapp 或 assets 目录
 * @param {File|Blob} apkFile - 用户上传的 APK 文件
 * @param {string} password - 口令
 * @param {string} preprocess - 预处理方式: 'none' | 'preprocess1'
 * @param {string} encryptType - 加密方式: 'fullaes' | 'getrun'
 * @param {string} filePreprocess - 文件预处理: 'none' | 'strip16'（仅 getrun 有效）
 * @param {string} aesPreprocess - AES 流前预处理: 'none' | 'sub2'（仅 getrun 有效）
 * @returns {Promise<{...}>}
 */
export async function processApkFile(
  apkFile, password, preprocess = 'preprocess1',
  encryptType = 'fullaes', filePreprocess = 'none',
  aesPreprocess = 'none'
) {
  try {
    // 1. 读取 APK (ZIP)
    const zip = await JSZip.loadAsync(apkFile);

    if (!password) {
      return {
        success: false,
        metaValue: null,
        derivedKey: null,
        decryptedFiles: [],
        originalFiles: [],
        error: '口令不能为空',
      };
    }

    if (encryptType === 'getrun') {
      return await processGetrun(zip, password, filePreprocess, aesPreprocess);
    }

    // 2. 根据预处理方式派生 DES 密钥
    let derivedKey;
    if (preprocess === 'preprocess1') {
      derivedKey = deriveDesKey(password);
    } else {
      derivedKey = password;
    }
    console.log(`password: "${password}", preprocess: "${preprocess}", derived key: "${derivedKey}"`);

    // === 全文AES 解密流程 ===
    const decryptedFiles = [];
    const originalFiles = [];

    // 获取所有以 assets/webapp 开头的文件
    const webappFiles = Object.keys(zip.files).filter(
      (name) => name.startsWith('assets/webapp/') && !zip.files[name].dir
    );

    for (const filePath of webappFiles) {
      const fileEntry = zip.files[filePath];
      const fileData = new Uint8Array(await fileEntry.async('arraybuffer'));
      const fileName = filePath.replace('assets/webapp/', '');

      if (shouldDecrypt(fileName)) {
        // 解密文件
        try {
          const decryptedBytes = decryptFileBytes(fileData, derivedKey);
          // 检测 MIME 类型
          const type = getMimeType(fileName);
          decryptedFiles.push({
            path: fileName,
            content: decryptedBytes,
            type,
            size: decryptedBytes.length,
          });
        } catch (err) {
          console.warn(`解密失败: ${fileName}`, err);
          // 解密失败则保留原始文件
          originalFiles.push({
            path: fileName,
            content: fileData,
            type: getMimeType(fileName),
            size: fileData.length,
          });
        }
      } else {
        // 非加密文件（图片等）直接保留
        originalFiles.push({
          path: fileName,
          content: fileData,
          type: getMimeType(fileName),
          size: fileData.length,
        });
      }
    }

    return {
      success: true,
      metaValue: password,
      derivedKey,
      decryptedFiles,
      originalFiles,
    };
  } catch (err) {
    return {
      success: false,
      metaValue: null,
      decryptedFiles: [],
      originalFiles: [],
      error: `处理 APK 文件失败: ${err.message}`,
    };
  }
}

/**
 * 生成解密后的 ZIP 压缩包
 * @param {Object} result - processApkFile 的返回结果
 * @param {string} zipFileName - 输出的 ZIP 文件名
 * @returns {Promise<Blob>} ZIP 文件的 Blob
 */
export async function createDecryptedZip(result, zipFileName) {
  const outZip = new JSZip();

  // 添加解密后的文件
  for (const file of result.decryptedFiles) {
    outZip.file(file.path, file.content);
  }

  // 添加原始未加密文件
  for (const file of result.originalFiles) {
    outZip.file(file.path, file.content);
  }

  return await outZip.generateAsync({ type: 'blob' });
}

/**
 * 根据文件名获取 MIME 类型
 */
function getMimeType(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mimeMap = {
    html: 'text/html',
    htm: 'text/html',
    js: 'application/javascript',
    css: 'text/css',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    ico: 'image/x-icon',
    json: 'application/json',
    xml: 'application/xml',
    txt: 'text/plain',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * getrun 解密流程：处理 assets/ 目录下的 html/js 文件
 * @param {JSZip} zip
 * @param {string} password - DES 密钥
 * @param {string} filePreprocess - 文件预处理: 'none' | 'strip16'
 * @param {string} aesPreprocess - AES 流前预处理: 'none' | 'sub2'
 */
async function processGetrun(zip, password, filePreprocess, aesPreprocess = 'none') {
  const decryptedFiles = [];
  const originalFiles = [];
  const stripFirst16 = filePreprocess === 'strip16';

  // 获取 assets/ 下所有文件（排除 webapp）
  const assetFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith('assets/') && !name.startsWith('assets/webapp/') && !zip.files[name].dir
  );

  for (const filePath of assetFiles) {
    const fileEntry = zip.files[filePath];
    const fileData = new Uint8Array(await fileEntry.async('arraybuffer'));
    const fileName = filePath.replace('assets/', '');

    const isHtmlJs = /\.(html|js)$/i.test(fileName);

    if (isHtmlJs) {
      try {
        // 1. 提取 getrun 载荷
        const payload = extractGetrunPayload(fileData, stripFirst16);
        if (!payload.success) {
          console.warn(`getrun 提取失败: ${fileName}`, payload.error);
          originalFiles.push({
            path: fileName, content: fileData,
            type: getMimeType(fileName), size: fileData.length,
          });
          continue;
        }

        // 2. AES 流前预处理（整体降2）
        let hexStr = payload.hexStr;
        if (aesPreprocess === 'sub2') {
          hexStr = bytesSub2(hexStr);
        }

        // 3. gf.b(String) — 解析 base-18 hex → DES 解密
        const decryptedBytes = gfBString(hexStr, password);
        const type = getMimeType(fileName);

        // 检测是否有乱码
        const garbled = hasGarbledChars(decryptedBytes);

        decryptedFiles.push({
          path: fileName,
          content: decryptedBytes,
          type,
          size: decryptedBytes.length,
          garbled,
        });
      } catch (err) {
        console.warn(`getrun 解密失败: ${fileName}`, err);
        originalFiles.push({
          path: fileName, content: fileData,
          type: getMimeType(fileName), size: fileData.length,
        });
      }
    } else {
      originalFiles.push({
        path: fileName, content: fileData,
        type: getMimeType(fileName), size: fileData.length,
      });
    }
  }

  return {
    success: true,
    metaValue: password,
    derivedKey: password,
    decryptedFiles,
    originalFiles,
  };
}
