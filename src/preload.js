const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // Files
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (content) => ipcRenderer.invoke('save-file', content),
  
  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // Execution
  runInSandbox: (code, language) => ipcRenderer.invoke('run-in-sandbox', code, language),
  aiAnalyze: (code, language) => ipcRenderer.invoke('ai-analyze', code, language),
  aiCorrect: (code, language) => ipcRenderer.invoke('ai-correct', code, language),
  aiGenerate: (prompt, language) => ipcRenderer.invoke('ai-generate', prompt, language),
  
  // Connection test
  testGeminiConnection: () => ipcRenderer.invoke('test-gemini-connection'),
  
  // Updates
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  
  // Event listeners
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onOpenFileDialog: (callback) => ipcRenderer.on('open-file-dialog', callback),
  onSaveFile: (callback) => ipcRenderer.on('save-file', callback),
  onAnalyzeCode: (callback) => ipcRenderer.on('analyze-code', callback),
  onRunSandbox: (callback) => ipcRenderer.on('run-sandbox', callback),
  onAiCorrect: (callback) => ipcRenderer.on('ai-correct', callback),
  onGenerateCode: (callback) => ipcRenderer.on('generate-code', callback),
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback),
  onPasteToWave: (callback) => ipcRenderer.on('paste-to-wave', callback),
  
  // Clipboard
  getClipboardText: () => navigator.clipboard.readText(),
  
  // Open external links
  openExternal: (url) => ipcRenderer.send('open-external', url)
});
