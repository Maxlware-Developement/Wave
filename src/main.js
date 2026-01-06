const { app, BrowserWindow, Menu, ipcMain, dialog, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { VM } = require('vm2');
const { GoogleGenerativeAI } = require('@google/generative-ai');

let mainWindow;
let isDev = process.env.NODE_ENV === 'development';

const VERSION_URL = 'https://mxlw-api-tempo.eletrixcloud.space/wave/version';

// Configuration for app
const defaultConfig = {
  geminiApiKey: 'AIzaSyAfABqzmZUxziIxTJTjc0Nu-NJBClCoZvQ',
  autoCheckUpdates: true,
  theme: 'dark',
  sandboxTimeout: 5000,
  language: 'fr',
  aiModel: 'gemini-pro',
  maxTokens: 2048,
  temperature: 0.2
};

function loadConfig() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.error('Erreur de chargement config:', error);
  }
  return defaultConfig;
}

function saveConfig(config) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function initGemini(apiKey) {
  if (!apiKey) return null;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI;
  } catch (error) {
    console.error('[AI] Errror of starting : ', error);
    return null;
  }
}

// Find all versions
async function getAvailableModels(apiKey) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Note: API not available to list models yet
    return ['gemini-pro', 'gemini-pro-vision'];
  } catch (error) {
    console.error('[AI] Error retrieving models: ', error);
    return ['gemini-pro'];
  }
}

async function analyzeCodeWithGemini(code, language, config) {
  if (!config.geminiApiKey) {
    throw new Error('[AI] Key not found');
  }

  const genAI = initGemini(config.geminiApiKey);
  if (!genAI) {
    throw new Error('[AI] Error initializing Gemini API');
  }

  // Use gemni-pro if gemini-1.5-pro or gemini-1.5-flash is selected
  const modelName = config.aiModel === 'gemini-1.5-pro' || config.aiModel === 'gemini-1.5-flash' ? 'gemini-pro' : config.aiModel;
  
  const model = genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: {
      maxOutputTokens: config.maxTokens || 2048,
      temperature: config.temperature || 0.2,
    }
  });

  // Prompt
  const prompt = `Tu es un expert en développement logiciel et analyse de code. Analyse le code ${language} suivant :

\`\`\`${language}
${code}
\`\`\`

Fournis une analyse détaillée avec :
1. Liste des erreurs (syntaxe, logique, sécurité) avec ligne, message et suggestion
2. Suggestions d'amélioration
3. Score de qualité sur 100
4. Recommandations de bonnes pratiques

Format de réponse en JSON:
{
  "errors": [
    {
      "line": number,
      "type": "error|warning|info",
      "message": "description",
      "suggestion": "correction proposée"
    }
  ],
  "suggestions": ["string"],
  "score": number,
  "bestPractices": ["string"],
  "complexity": "low|medium|high",
  "securityIssues": ["string"]
}

IMPORTANT: Réponds uniquement avec le JSON, sans texte supplémentaire.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    let cleanedText = text.trim();
    
    cleanedText = cleanedText.replace(/```json\n?/g, '');
    cleanedText = cleanedText.replace(/```\n?/g, '');
    cleanedText = cleanedText.replace(/^json\s*\n?/g, '');
    
    try {
      const analysis = JSON.parse(cleanedText);
      return analysis;
    } catch (parseError) {
      console.error('[AI] Error parsing JSON:', parseError);
      console.error('[AI] Text found:', cleanedText);
      
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const analysis = JSON.parse(jsonMatch[0]);
          return analysis;
        } catch (e) {
          throw new Error(`[AI]:Message not autorized ${e.message}`);
        }
      }
      throw new Error('[AI] Invalid response format from API');
    }
  } catch (error) {
    console.error('[AI] Error API Gemini:', error);
    
    if (error.message.includes('API key not valid')) {
      throw new Error('[AI] API key not valid. Please check your Gemini API key.');
    } else if (error.message.includes('not found for API version')) {
      throw new Error(`[AI] "${config.aiModel}" Not found. Please select a valid model.`);
    } else if (error.message.includes('429')) {
      throw new Error('[AI] Rate limit exceeded. Please try again later.');
    } else if (error.message.includes('403')) {
      throw new Error('[AI] Access denied. Check your API key and permissions.');
    }

    throw new Error(`[AI] Error during analysis: ${error.message}`);
  }
}

async function correctCodeWithGemini(code, language, config) {
  if (!config.geminiApiKey) {
    throw new Error('[AI] Gemini API key not configured');
  }

  const genAI = initGemini(config.geminiApiKey);
  const modelName = config.aiModel === 'gemini-1.5-pro' || config.aiModel === 'gemini-1.5-flash' ? 'gemini-pro' : config.aiModel;
  
  const model = genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: {
      maxOutputTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.3,
    }
  });

  const prompt = `Corrige et améliore le code ${language} suivant. Fournis le code corrigé complet avec des explications des changements.

Code original:
\`\`\`${language}
${code}
\`\`\`

Réponds au format JSON:
{
  "correctedCode": "code corrigé complet",
  "explanations": [
    {
      "line": number,
      "change": "description du changement",
      "reason": "raison de la modification"
    }
  ],
  "improvements": ["liste des améliorations apportées"],
  "beforeAfter": {
    "complexity": {"before": "value", "after": "value"},
    "readability": {"before": "1-10", "after": "1-10"},
    "performance": {"before": "1-10", "after": "1-10"}
  }
}

IMPORTANT: Réponds uniquement avec le JSON, sans texte supplémentaire.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    let cleanedText = text.trim();
    cleanedText = cleanedText.replace(/```json\n?/g, '');
    cleanedText = cleanedText.replace(/```\n?/g, '');
    cleanedText = cleanedText.replace(/^json\s*\n?/g, '');
    
    try {
      const correction = JSON.parse(cleanedText);
      return correction;
    } catch (parseError) {
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const correction = JSON.parse(jsonMatch[0]);
          return correction;
        } catch (e) {
          throw new Error(`[AI]:Message not autorized ${e.message}`);
        }
      }
      throw new Error('[AI] Invalid response format from API');
    }
  } catch (error) {
    console.error('[AI] Error correction Gemini:', error);
    throw new Error(`[AI] Error during correction: ${error.message}`);
  }
}

// Create main window
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#121212'
  });

  // Load index.html
  mainWindow.loadFile('index.html');

  // Shortcuts and Menu
  const menuTemplate = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Ouvrir Fichier',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('open-file-dialog')
        },
        {
          label: 'Sauvegarder',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('save-file')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        {
          label: 'Coller dans Wave',
          accelerator: 'Ctrl+V+W',
          click: () => mainWindow.webContents.send('paste-to-wave')
        }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Outils',
      submenu: [
        {
          label: 'Analyser le Code',
          accelerator: 'F5',
          click: () => mainWindow.webContents.send('analyze-code')
        },
        {
          label: 'Exécuter Sandbox',
          accelerator: 'F6',
          click: () => mainWindow.webContents.send('run-sandbox')
        },
        {
          label: 'Correction IA',
          accelerator: 'F7',
          click: () => mainWindow.webContents.send('ai-correct')
        },
        {
          label: 'Générer du Code',
          accelerator: 'F8',
          click: () => mainWindow.webContents.send('generate-code')
        }
      ]
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'Documentation Gemini',
          click: () => shell.openExternal('https://ai.google.dev/gemini-api/docs')
        },
        {
          label: 'Obtenir une clé API',
          click: () => shell.openExternal('https://makersuite.google.com/app/apikey')
        },
        { type: 'separator' },
        {
          label: 'Vérifier les mises à jour',
          click: () => checkForUpdates()
        },
        { role: 'about' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  app.whenReady().then(() => {
    globalShortcut.register('Ctrl+V+W', () => {
      mainWindow.webContents.send('paste-to-wave');
    });
  });

  if (loadConfig().autoCheckUpdates) {
    checkForUpdates();
  }
}

async function checkForUpdates() {
  try {
    const response = await axios.get(VERSION_URL, { timeout: 5000 });
    const latestVersion = response.data.version;
    const currentVersion = app.getVersion();
    
    if (latestVersion !== currentVersion) {
      mainWindow.webContents.send('update-available', {
        current: currentVersion,
        latest: latestVersion,
        changelog: response.data.changelog || 'Mises à jour de sécurité et améliorations',
        downloadUrl: response.data.downloadUrl || '#'
      });
    }
  } catch (error) {
    console.error('[Update] Error checking version:', error);
  }
}

ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (event, config) => saveConfig(config));
ipcMain.handle('check-updates', checkForUpdates);

ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Fichiers Code', extensions: ['js', 'ts', 'py', 'java', 'cpp', 'c', 'html', 'css', 'php', 'rb', 'go', 'rs', 'swift', 'kt'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    return { filePath, content };
  }
  return null;
});

ipcMain.handle('save-file', async (event, content) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Fichiers Code', extensions: ['js', 'ts', 'py', 'java', 'cpp', 'c', 'html', 'css', 'php', 'rb', 'go', 'rs', 'swift', 'kt'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled) {
    fs.writeFileSync(result.filePath, content, 'utf8');
    return result.filePath;
  }
  return null;
});

ipcMain.handle('run-in-sandbox', async (event, code, language) => {
  try {
    const config = loadConfig();
    const vm = new VM({
      timeout: config.sandboxTimeout,
      sandbox: {},
      eval: false,
      wasm: false,
      fixAsync: true
    });
    
    let result;
    switch (language) {
      case 'javascript':
        // Javascript sandboxed execution
        try {
          result = vm.run(`(function() { ${code} })()`);
          return { success: true, output: result !== undefined ? String(result) : 'Exécution réussie (pas de sortie)' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      case 'python':
        // Python execution simulation
        result = `Exécution Python simulée\nCode analysé: ${code.length} caractères\n\nNote: Pour exécuter réellement du Python, utilisez un interpréteur Python local.`;
        return { success: true, output: result };
      default:
        result = `Exécution simulée pour ${language}\nCode analysé avec succès.\nLongueur du code: ${code.length} caractères`;
        return { success: true, output: result };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-analyze', async (event, code, language) => {
  const config = loadConfig();
  
  try {
    const analysis = await analyzeCodeWithGemini(code, language, config);
    return { success: true, analysis };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-correct', async (event, code, language) => {
  const config = loadConfig();
  
  try {
    const correction = await correctCodeWithGemini(code, language, config);
    return { success: true, correction };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-generate', async (event, prompt, language) => {
  const config = loadConfig();
  
  if (!config.geminiApiKey) {
    return { error: '[AI] Gemini API key not configured' };
  }

  const genAI = initGemini(config.geminiApiKey);
  const modelName = config.aiModel === 'gemini-1.5-pro' || config.aiModel === 'gemini-1.5-flash' ? 'gemini-pro' : config.aiModel;
  
  const model = genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: {
      maxOutputTokens: config.maxTokens || 2048,
      temperature: 0.7, // Generation may benefit from higher temperature
    }
  });

  const generationPrompt = `Génère du code ${language} pour: ${prompt}

Règles:
1. Fournis uniquement le code sans explications
2. Pas de texte avant ou après le code
3. Le code doit être fonctionnel et bien formaté
4. Ajoute des commentaires si nécessaire`;

  try {
    const result = await model.generateContent(generationPrompt);
    const response = await result.response;
    const code = response.text();
    
    return { success: true, code: code.trim() };
  } catch (error) {
    console.error('Erreur génération:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-gemini-connection', async (event) => {
  const config = loadConfig();
  
  if (!config.geminiApiKey) {
    return { success: false, error: '[AI] Gemini API key not configured' };
  }

  try {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const modelName = config.aiModel === 'gemini-1.5-pro' || config.aiModel === 'gemini-1.5-flash' ? 'gemini-pro' : config.aiModel;
    const model = genAI.getGenerativeModel({ model: modelName });
    
    const result = await model.generateContent('Réponds simplement par "OK"');
    const response = await result.response;
    const text = response.text();
    
    return { success: true, message: 'Connexion réussie à Gemini API' };
  } catch (error) {
    console.error('[AI] Error testing connection:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('minimize-window', () => mainWindow.minimize());
ipcMain.on('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('close-window', () => mainWindow.close());
ipcMain.on('open-external', (event, url) => shell.openExternal(url));

ipcMain.on('generate-code', () => mainWindow.webContents.send('generate-code'));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
