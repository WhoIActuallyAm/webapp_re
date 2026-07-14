<script setup>
import { ref, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { processApkFile, detectMetaData } from './utils/apkUtils.js'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import hljs from 'highlight.js'
import 'highlight.js/styles/vs2015.min.css'
import {
  UploadFilled,
  Download,
  Refresh,
  Folder,
  Document,
  View,
  Lock,
} from '@element-plus/icons-vue'

// 状态管理
const step = ref('upload') // upload | processing | result | error | needPassword
const apkFileName = ref('')
const apkFileSize = ref(0)
const metaValue = ref('')
const derivedKey = ref('')
const decryptedFiles = ref([])
const originalFiles = ref([])
const errorMsg = ref('')
const progressText = ref('')
const progressPercent = ref(0)
const selectedFile = ref(null)
const previewContent = ref('')
const previewType = ref('none') // 'html' | 'code' | 'image' | 'none'
const previewUrl = ref('')
const showSource = ref(false) // HTML 预览时是否显示源代码

// 手动口令相关
const manualPassword = ref('bzyapp')
const pendingApkFile = ref(null) // 等待重试的 APK 文件
const passwordFound = ref(false) // APK 中是否找到口令
const preprocessType = ref('none') // 预处理方式: 'none' | 'preprocess1'

// 文件树数据
const fileTree = computed(() => {
  const allFiles = [
    ...decryptedFiles.value.map(f => ({ ...f, isDecrypted: true })),
    ...originalFiles.value.map(f => ({ ...f, isDecrypted: false })),
  ]
  // 按目录分组
  const tree = []
  const dirMap = {}
  for (const file of allFiles) {
    const parts = file.path.split('/')
    if (parts.length === 1) {
      tree.push({ ...file, label: file.path, children: null, path: file.path })
    } else {
      const dirName = parts[0]
      if (!dirMap[dirName]) {
        dirMap[dirName] = { label: dirName, children: [], path: dirName }
        tree.push(dirMap[dirName])
      }
      dirMap[dirName].children.push({
        ...file,
        label: parts.slice(1).join('/'),
        children: null,
        path: file.path,
      })
    }
  }
  return tree
})

// 根据文件名推断语法高亮语言
function getHighlightLanguage(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase()
  const langMap = {
    html: 'html',
    htm: 'html',
    js: 'javascript',
    mjs: 'javascript',
    css: 'css',
    json: 'json',
    xml: 'xml',
    svg: 'xml',
    md: 'markdown',
    txt: 'plaintext',
  }
  return langMap[ext] || 'plaintext'
}

// 语法高亮后的 HTML
const highlightedCode = computed(() => {
  const code = previewContent.value
  if (!code) return ''
  const lang = getHighlightLanguage(selectedFile.value?.path)
  try {
    const result = hljs.highlight(code, { language: lang, ignoreIllegals: true })
    return result.value
  } catch {
    // 高亮失败时做基本的 HTML 转义后返回
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
})

// 是否有解密文件
const hasDecryptedFiles = computed(() => decryptedFiles.value.length > 0)

// 总文件数
const totalFiles = computed(() => decryptedFiles.value.length + originalFiles.value.length)

// 处理文件上传
async function handleUpload(file) {
  if (!file) return

  if (!file.name.endsWith('.apk')) {
    ElMessage.warning('请上传 .apk 格式的文件')
    return
  }

  apkFileName.value = file.name
  apkFileSize.value = file.size
  step.value = 'processing'
  progressText.value = '正在读取 APK 文件...'
  progressPercent.value = 10

  await nextTick()

  try {
    await sleep(100)
    progressText.value = '正在解析 AndroidManifest.xml...'
    progressPercent.value = 30

    // 先检测 APK 中是否有口令
    const { metaValue: detectedPwd, found } = await detectMetaData(file)

    pendingApkFile.value = file
    passwordFound.value = found

    if (found) {
      // 找到口令，预填并默认预处理1
      manualPassword.value = detectedPwd
      preprocessType.value = 'preprocess1'
      errorMsg.value = '已从 APK 中检测到口令，请确认或修改后解密'
    } else {
      // 未找到口令，使用默认口令，不处理
      manualPassword.value = 'bzyapp'
      preprocessType.value = 'none'
      errorMsg.value = '未找到口令，请输入正确口令'
    }

    step.value = 'needPassword'
  } catch (err) {
    errorMsg.value = err.message || '处理失败'
    step.value = 'error'
    ElMessage.error(errorMsg.value)
  }
}

// 使用手动口令解密
async function retryWithPassword() {
  if (!pendingApkFile.value) return
  if (!manualPassword.value.trim()) {
    ElMessage.warning('请输入口令')
    return
  }

  step.value = 'processing'
  progressText.value = '正在解密...'
  progressPercent.value = 30
  await nextTick()

  try {
    const result = await processApkFile(
      pendingApkFile.value,
      manualPassword.value.trim(),
      preprocessType.value
    )

    if (!result.success) {
      errorMsg.value = result.error || '口令错误，请重试'
      step.value = 'needPassword'
      ElMessage.error('口令错误，请重试')
      return
    }

    progressText.value = '解密完成！'
    progressPercent.value = 100
    metaValue.value = result.metaValue
    derivedKey.value = result.derivedKey
    decryptedFiles.value = result.decryptedFiles
    originalFiles.value = result.originalFiles
    pendingApkFile.value = null

    step.value = 'result'
    ElMessage.success(`解密成功！共处理 ${totalFiles.value} 个文件`)
  } catch (err) {
    errorMsg.value = err.message || '解密失败'
    step.value = 'needPassword'
    ElMessage.error('解密失败，请检查口令是否正确')
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 文件大小格式化
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 获取 APK 基本名（不含扩展名）
function getBaseName(name) {
  return name.replace(/\.apk$/i, '')
}

// 下载解密后的 ZIP
async function downloadZip() {
  try {
    ElMessage.info('正在生成 ZIP 文件...')
    const allFiles = [
      ...decryptedFiles.value,
      ...originalFiles.value,
    ]

    const outZip = new JSZip()
    for (const file of allFiles) {
      outZip.file(file.path, file.content)
    }
    const blob = await outZip.generateAsync({ type: 'blob' })
    const zipName = getBaseName(apkFileName.value) + '.zip'
    saveAs(blob, zipName)
    ElMessage.success(`已下载: ${zipName}`)
  } catch (err) {
    ElMessage.error('生成 ZIP 失败: ' + err.message)
  }
}

// 预览文件
function previewFile(file) {
  selectedFile.value = file

  // 清除旧 URL
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }

  if (file.type.startsWith('image/')) {
    previewType.value = 'image'
    const blob = new Blob([file.content], { type: file.type })
    previewUrl.value = URL.createObjectURL(blob)
    previewContent.value = ''
  } else if (file.type === 'text/html') {
    previewType.value = 'html'
    showSource.value = false
    const blob = new Blob([file.content], { type: 'text/html' })
    previewUrl.value = URL.createObjectURL(blob)
    const decoder = new TextDecoder('utf-8', { fatal: false })
    previewContent.value = decoder.decode(file.content)
  } else {
    previewType.value = 'code'
    const decoder = new TextDecoder('utf-8', { fatal: false })
    previewContent.value = decoder.decode(file.content)
  }
}

// 重新选择
function resetUpload() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
  step.value = 'upload'
  apkFileName.value = ''
  apkFileSize.value = 0
  metaValue.value = ''
  derivedKey.value = ''
  decryptedFiles.value = []
  originalFiles.value = []
  errorMsg.value = ''
  selectedFile.value = null
  previewContent.value = ''
  previewType.value = 'none'
  showSource.value = false
  pendingApkFile.value = null
  manualPassword.value = 'bzyapp'
  passwordFound.value = false
  preprocessType.value = 'none'
}
</script>

<template>
  <div class="app-container">
    <!-- 顶部标题 -->
    <header class="app-header">
      <h1>
        <el-icon :size="28" style="margin-right: 10px; vertical-align: middle">
          <Lock />
        </el-icon>
        APK WebApp 解密器
      </h1>
      <p class="subtitle">上传加密的 APK 文件，解密并预览 assets/webapp 目录内容</p>
    </header>

    <main class="app-main">
      <!-- ===== 上传区域 ===== -->
      <section v-if="step === 'upload'" class="upload-section">
        <el-upload
          drag
          accept=".apk"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="(uploadFile) => handleUpload(uploadFile.raw)"
          class="upload-area"
        >
          <el-icon :size="64" class="upload-icon">
            <UploadFilled />
          </el-icon>
          <div class="upload-text">
            <p>将 APK 文件拖拽到此处，或<em>点击选择</em></p>
            <p class="upload-hint">仅支持 .apk 格式，所有操作均在浏览器本地完成</p>
          </div>
        </el-upload>
      </section>

      <!-- ===== 口令确认 ===== -->
      <section v-if="step === 'needPassword'" class="password-section">
        <el-card class="password-card" shadow="always">
          <div class="password-content">
            <el-icon :size="48" :color="passwordFound ? '#409eff' : '#e6a23c'" style="margin-bottom: 16px">
              <Lock />
            </el-icon>
            <h2 class="password-title">{{ passwordFound ? '检测到口令' : '未找到口令' }}</h2>
            <p class="password-desc">{{ errorMsg }}</p>
            <div class="password-input-row">
              <el-input
                v-model="manualPassword"
                :placeholder="manualPassword"
                size="large"
                clearable
                style="max-width: 360px"
                @keyup.enter="retryWithPassword"
              />
            </div>
            <div class="preprocess-row">
              <span class="preprocess-label">口令预处理</span>
              <el-select v-model="preprocessType" style="width: 160px">
                <el-option label="不处理" value="none" />
                <el-option label="预处理1" value="preprocess1" />
              </el-select>
            </div>
            <el-button type="primary" size="large" style="margin-top: 12px" @click="retryWithPassword">
              确认解密
            </el-button>
          </div>
          <div class="password-actions">
            <el-button size="small" @click="resetUpload">返回重新选择</el-button>
          </div>
        </el-card>
      </section>

      <!-- ===== 处理中 ===== -->
      <section v-if="step === 'processing'" class="processing-section">
        <el-card class="status-card" shadow="always">
          <div class="processing-content">
            <el-progress
              :percentage="progressPercent"
              :stroke-width="8"
              status="success"
              style="max-width: 400px; width: 100%"
            />
            <p class="progress-text">{{ progressText }}</p>
            <p v-if="apkFileName" class="file-info">
              文件: {{ apkFileName }} ({{ formatSize(apkFileSize) }})
            </p>
          </div>
        </el-card>
      </section>

      <!-- ===== 结果展示 ===== -->
      <section v-if="step === 'result'" class="result-section">
        <!-- 信息卡片 -->
        <el-card class="info-card" shadow="always">
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">APK 文件</span>
              <span class="info-value">{{ apkFileName }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Meta-data main</span>
              <el-tag type="success">{{ metaValue || '(空)' }}</el-tag>
            </div>
            <div class="info-item">
              <span class="info-label">派生密钥</span>
              <el-tag>{{ derivedKey || '(空)' }}</el-tag>
            </div>
            <div class="info-item">
              <span class="info-label">解密文件</span>
              <span class="info-value">{{ decryptedFiles.length }} / {{ totalFiles }} 个</span>
            </div>
          </div>
        </el-card>

        <!-- 操作按钮 -->
        <div class="action-bar">
          <el-button type="primary" :icon="Download" size="large" @click="downloadZip">
            下载解密 ZIP
          </el-button>
          <el-button :icon="Refresh" size="large" @click="resetUpload">
            重新选择
          </el-button>
        </div>

        <!-- 文件浏览器 + 预览 -->
        <el-card class="browser-card" shadow="always">
          <template #header>
            <div class="browser-header">
              <span>assets/webapp/ 目录内容</span>
              <el-tag size="small" type="info" effect="plain">
                {{ totalFiles }} 个文件
              </el-tag>
            </div>
          </template>

          <div class="browser-layout">
            <!-- 左侧: 文件树 -->
            <div class="file-tree">
              <div v-if="fileTree.length === 0" class="tree-empty">
                <p>目录为空</p>
              </div>
              <el-tree
                v-else
                :data="fileTree"
                :props="{ label: 'label', children: 'children' }"
                node-key="path"
                highlight-current
                @node-click="(data) => { if (data.children === null) previewFile(data) }"
              >
                <template #default="{ data }">
                  <span class="tree-node">
                    <el-icon v-if="data.children" :size="16">
                      <Folder />
                    </el-icon>
                    <el-icon v-else :size="16">
                      <Document :class="data.isDecrypted ? 'decrypted-clr' : 'original-clr'" />
                    </el-icon>
                    <span class="tree-label">{{ data.label }}</span>
                    <el-tag
                      v-if="data.children === null && data.isDecrypted"
                      size="small"
                      type="warning"
                      class="decrypt-tag"
                      effect="dark"
                    >
                      已解密
                    </el-tag>
                  </span>
                </template>
              </el-tree>
            </div>

            <!-- 右侧: 预览 -->
            <div class="preview-area">
              <!-- 未选择 -->
              <div v-if="!selectedFile" class="preview-empty">
                <el-icon :size="48" color="#c0c4cc"><View /></el-icon>
                <p>请在左侧选择文件预览</p>
              </div>

              <!-- HTML 预览（渲染/源代码切换） -->
              <div v-else-if="previewType === 'html'" class="preview-html">
                <div class="preview-header">
                  <span>{{ selectedFile.path }}</span>
                  <el-tag size="small" type="info" effect="plain" style="margin-right: 8px">HTML</el-tag>
                  <el-button
                    size="small"
                    :type="showSource ? 'primary' : 'default'"
                    @click="showSource = !showSource"
                  >
                    {{ showSource ? '渲染视图' : '源代码' }}
                  </el-button>
                </div>
                <iframe
                  v-show="!showSource"
                  :src="previewUrl"
                  class="preview-iframe"
                  sandbox="allow-scripts allow-same-origin"
                  title="preview"
                ></iframe>
                <pre v-show="showSource" class="code-content html-source"><code v-html="highlightedCode"></code></pre>
              </div>

              <!-- 图片预览 -->
              <div v-else-if="previewType === 'image'" class="preview-image">
                <div class="preview-header">
                  <span>{{ selectedFile.path }}</span>
                  <el-tag size="small" type="info" effect="plain">图片</el-tag>
                </div>
                <div class="image-container">
                  <img :src="previewUrl" :alt="selectedFile.path" />
                </div>
              </div>

              <!-- 代码预览 -->
              <div v-else-if="previewType === 'code'" class="preview-code">
                <div class="preview-header">
                  <span>{{ selectedFile.path }}</span>
                  <el-tag size="small" type="info" effect="plain">源代码</el-tag>
                </div>
                <pre class="code-content"><code v-html="highlightedCode"></code></pre>
              </div>
            </div>
          </div>
        </el-card>
      </section>

      <!-- ===== 错误状态 ===== -->
      <section v-if="step === 'error'" class="error-section">
        <el-result
          icon="error"
          title="处理失败"
          :sub-title="errorMsg"
        >
          <template #extra>
            <el-button type="primary" @click="resetUpload">重新上传</el-button>
          </template>
        </el-result>
      </section>
    </main>

    <!-- 底部 -->
    <footer class="app-footer">
      <p>所有操作均在浏览器本地执行，文件不会上传到服务器</p>
    </footer>
  </div>
</template>

<style>
/* 全局样式 */
:root {
  --app-max-width: 1200px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  background-attachment: fixed;
}

#app {
  min-height: 100vh;
}
</style>

<style scoped>
.app-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ===== 头部 ===== */
.app-header {
  text-align: center;
  padding: 30px 20px;
  color: #fff;
}

.app-header h1 {
  font-size: 28px;
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.subtitle {
  font-size: 15px;
  opacity: 0.85;
}

/* ===== 主内容 ===== */
.app-main {
  flex: 1;
}

/* ===== 上传区域 ===== */
.upload-section {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.upload-area {
  width: 100%;
  max-width: 600px;
}

.upload-area :deep(.el-upload-dragger) {
  padding: 60px 40px;
  border: 2px dashed #c0c4cc;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  transition: all 0.3s;
}

.upload-area :deep(.el-upload-dragger:hover) {
  border-color: #409eff;
  background: #fff;
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.upload-icon {
  color: #409eff;
  margin-bottom: 16px;
}

.upload-text p {
  font-size: 16px;
  color: #606266;
  margin-bottom: 4px;
}

.upload-text em {
  color: #409eff;
  font-style: normal;
  font-weight: 500;
}

.upload-hint {
  font-size: 13px !important;
  color: #909399 !important;
}

/* ===== 口令输入 ===== */
.password-section {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

.password-card {
  width: 100%;
  max-width: 500px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.95);
}

.password-content {
  text-align: center;
  padding: 40px 20px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.password-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.password-desc {
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
}

.password-input-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  justify-content: center;
  flex-wrap: wrap;
}

.preprocess-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.preprocess-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
}

.password-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.password-actions {
  text-align: center;
  padding: 0 20px 20px;
}

/* ===== 处理中 ===== */
.processing-section {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

.status-card {
  width: 100%;
  max-width: 500px;
  border-radius: 12px;
}

.processing-content {
  text-align: center;
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.progress-text {
  font-size: 16px;
  color: #606266;
}

.file-info {
  font-size: 13px;
  color: #909399;
}

/* ===== 结果区域 ===== */
.result-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.95);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: #909399;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
  word-break: break-all;
}

/* 操作按钮 */
.action-bar {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

/* 浏览器卡片 */
.browser-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.95);
}

.browser-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}

.browser-layout {
  display: flex;
  min-height: 500px;
}

/* 文件树 */
.file-tree {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid #ebeef5;
  padding: 8px;
  overflow-y: auto;
  max-height: 600px;
}

.tree-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  color: #909399;
  font-size: 13px;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 2px 0;
  width: 100%;
}

.tree-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.decrypted-clr {
  color: #e6a23c;
}

.original-clr {
  color: #909399;
}

.decrypt-tag {
  font-size: 10px;
  padding: 0 4px;
  height: 18px;
  line-height: 18px;
  flex-shrink: 0;
}

/* 预览区域 */
.preview-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.preview-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  gap: 12px;
  min-height: 400px;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
  font-size: 13px;
  font-weight: 500;
  flex-shrink: 0;
}

.preview-header span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* HTML iframe */
.preview-html {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.preview-iframe {
  flex: 1;
  border: none;
  width: 100%;
  min-height: 500px;
}

/* 图片预览 */
.preview-image {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.image-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: #fafafa;
}

.image-container img {
  max-width: 100%;
  max-height: 500px;
  object-fit: contain;
}

/* 代码预览 */
.preview-code {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.code-content {
  flex: 1;
  margin: 0;
  padding: 16px;
  background: #282c34;
  color: #abb2bf;
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  min-height: 400px;
}

/* 错误 */
.error-section {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

/* 底部 */
.app-footer {
  text-align: center;
  padding: 20px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}

/* ===== 响应式: 平板 ===== */
@media (max-width: 768px) {
  .app-container {
    padding: 12px;
  }

  .app-header {
    padding: 20px 10px;
  }

  .app-header h1 {
    font-size: 22px;
  }

  .subtitle {
    font-size: 13px;
  }

  .info-grid {
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .browser-layout {
    flex-direction: column;
  }

  .file-tree {
    width: 100%;
    min-width: 100%;
    max-height: 200px;
    border-right: none;
    border-bottom: 1px solid #ebeef5;
  }

  .preview-iframe {
    min-height: 350px;
  }

  .code-content {
    min-height: 250px;
    font-size: 12px;
  }

  .upload-area :deep(.el-upload-dragger) {
    padding: 40px 20px;
  }
}

/* ===== 响应式: 手机 ===== */
@media (max-width: 480px) {
  .app-header h1 {
    font-size: 18px;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .action-bar {
    flex-direction: column;
  }

  .action-bar .el-button {
    width: 100%;
  }

  .upload-area :deep(.el-upload-dragger) {
    padding: 30px 16px;
  }

  .upload-text p {
    font-size: 14px;
  }
}
</style>
