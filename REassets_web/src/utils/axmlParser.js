/**
 * Android Binary XML (AXML) 解析器
 * 用于从 AndroidManifest.xml 中提取 meta-data 信息
 *
 * AXML 格式:
 * - 顶层: XML 文档块 (type=0x0003)
 *   - 子块: 字符串池 (type=0x0001)
 *   - 子块: 资源映射 (type=0x0180)
 *   - 子块: XML 节点树 (start/end namespace, start/end tag, text)
 */

/**
 * 读取 Uint8Array 中的小端 uint16
 */
function readU16(data, offset) {
  return (data[offset + 1] << 8) | data[offset];
}

/**
 * 读取 Uint8Array 中的小端 uint32
 */
function readU32(data, offset) {
  return (
    ((data[offset + 3] << 24) |
    (data[offset + 2] << 16) |
    (data[offset + 1] << 8) |
    data[offset]) >>> 0
  );
}

/**
 * 从 AXML 的字符串池中读取 UTF-16LE 字符串
 */
function readString(data, offset) {
  const strLen = readU16(data, offset);
  let result = '';
  for (let j = 0; j < strLen; j++) {
    const code = readU16(data, offset + 2 + j * 2);
    if (code !== 0) {
      result += String.fromCharCode(code);
    }
  }
  return result;
}

/**
 * 解析 XML 文档中的各个块
 * @param {Uint8Array} data - AXML 数据
 * @param {number} startPos - 起始位置（从 XML 文档内容开头）
 * @param {number} endPos - 结束位置
 * @param {string[]} strings - 已解析的字符串数组（引用传递）
 * @returns {Array<{name:string, value:string}>} meta-data 列表
 */
function parseChunks(data, startPos, endPos, strings) {
  const metaDataList = [];
  let pos = startPos;

  while (pos <= endPos - 8) {
    const chunkType = readU16(data, pos);
    const headerSize = readU16(data, pos + 2);
    const chunkSize = readU32(data, pos + 4);

    if (chunkSize < 8) break;
    if (pos + chunkSize > endPos) break;

    if (chunkType === 0x0001) {
      // 字符串池
      const stringCount = readU32(data, pos + 8);
      const stringsStart = readU32(data, pos + 20);

      for (let i = 0; i < stringCount; i++) {
        const strOffset = readU32(data, pos + 28 + i * 4);
        const strDataPos = pos + stringsStart + strOffset;
        if (strDataPos + 2 <= data.length) {
          try {
            strings.push(readString(data, strDataPos));
          } catch {
            strings.push('');
          }
        } else {
          strings.push('');
        }
      }
    } else if (chunkType === 0x0102) {
      // Start tag
      const nameIndex = readU32(data, pos + 20);
      const attributeStart = readU16(data, pos + 24);
      const attributeSize = readU16(data, pos + 26);
      const attributeCount = readU16(data, pos + 28);

      const tagName = nameIndex < strings.length ? strings[nameIndex] : '';
      if (tagName === 'meta-data') {
        let metaName = '';
        let metaValue = '';
        // attributeStart 是相对于 ResXMLTree_attrExt (pos+16) 的偏移
        const attrExtStart = pos + 16;
        let attrOffset = attrExtStart + attributeStart;

        for (let i = 0; i < attributeCount; i++) {
          const aNameIdx = readU32(data, attrOffset + 4);
          const aValueStrIdx = readU32(data, attrOffset + 8);
          const attrName = aNameIdx < strings.length ? strings[aNameIdx] : '';
          const attrValue =
            aValueStrIdx < strings.length && aValueStrIdx !== 0xffffffff
              ? strings[aValueStrIdx]
              : null;

          if (attrName === 'name' && attrValue !== null) {
            metaName = attrValue;
          } else if (attrName === 'value' && attrValue !== null) {
            metaValue = attrValue;
          }
          attrOffset += attributeSize;
        }

        if (metaName) {
          metaDataList.push({ name: metaName, value: metaValue });
        }
      }
    }

    pos += chunkSize;
  }

  return metaDataList;
}

/**
 * 解析 AXML 文件，提取所有字符串和 meta-data 信息
 * @param {Uint8Array} data - AndroidManifest.xml 的二进制数据
 * @returns {Object} { strings: string[], metaData: { name: string, value: string }[] }
 */
export function parseAXML(data) {
  const strings = [];
  const metaDataList = [];

  if (data.length < 8) return { strings, metaData: metaDataList };

  // 检查顶层块类型
  const topType = readU16(data, 0);

  if (topType === 0x0003) {
    // XML 文档块: 内容从 headerSize (通常是 8) 开始
    const headerSize = readU16(data, 2);
    const chunkSize = readU32(data, 4);
    const contentStart = headerSize;
    const contentEnd = chunkSize;

    const list = parseChunks(data, contentStart, contentEnd, strings);
    metaDataList.push(...list);
  } else {
    // 不是 XML 文档块，直接解析
    const list = parseChunks(data, 0, data.length, strings);
    metaDataList.push(...list);
  }

  return { strings, metaData: metaDataList };
}

/**
 * 从 AndroidManifest.xml 二进制数据中提取 meta-data 的 value
 * @param {Uint8Array} axmlData - AndroidManifest.xml 的二进制数据
 * @param {string} targetName - meta-data 的 name 属性值，默认 'main'
 * @returns {string|null} meta-data 的 value，没找到返回 null
 */
export function getMetaDataValue(axmlData, targetName = 'main') {
  const { metaData } = parseAXML(axmlData);
  for (const md of metaData) {
    if (md.name === targetName) return md.value;
  }
  return null;
}
