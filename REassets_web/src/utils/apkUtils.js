/**
 * APK 处理工具模块
 * 负责：读取 APK (ZIP)、解析 AndroidManifest.xml、解密 assets/webapp 文件、生成输出 ZIP
 */

import JSZip from 'jszip';
import { getMetaDataValue } from './axmlParser.js';
import { deriveDesKey, decryptFileBytes } from './decryptUtils.js';

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
 * 处理 APK 文件：解密 assets/webapp 目录
 * @param {File|Blob} apkFile - 用户上传的 APK 文件
 * @returns {Promise<{
 *   success: boolean,
 *   metaValue: string|null,
 *   decryptedFiles: { path: string, content: Uint8Array, type: string }[],
 *   originalFiles: { path: string, content: Uint8Array, type: string }[],
 *   error?: string
 * }>}
 */
export async function processApkFile(apkFile) {
  try {
    // 1. 读取 APK (ZIP)
    const zip = await JSZip.loadAsync(apkFile);

    // 2. 从 AndroidManifest.xml 提取 meta-data
    const metaValue = await extractMetaDataValue(zip, 'main');
    if (!metaValue) {
      return {
        success: false,
        metaValue: null,
        decryptedFiles: [],
        originalFiles: [],
        error: '未在 AndroidManifest.xml 中找到 meta-data name="main" 的值',
      };
    }

    // 3. 派生 DES 密钥
    const derivedKey = deriveDesKey(metaValue);
    console.log(`meta-data value: "${metaValue}", derived key: "${derivedKey}"`);

    // 4. 遍历 assets/webapp 目录
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
      metaValue,
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
