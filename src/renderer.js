// Variables
let currentCode = '';
let currentLanguage = 'javascript';
let currentFile = null;
let currentCorrection = null;

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    
    setupEventListeners();
    
    setupTemperatureSlider();
    
    document.addEventListener('keydown', handleKeyDown);
});

async function loadConfig() {
    try {
        const config = await window.electronAPI.getConfig();
        
        document.getElementById('geminiApiKey').value = config.geminiApiKey || '';
        document.getElementById('aiModel').value = config.aiModel || 'gemini-pro';
        document.getElementById('maxTokens').value = config.maxTokens || 2048;
        document.getElementById('temperature').value = config.temperature || 0.2;
        document.getElementById('sandboxTimeout').value = config.sandboxTimeout || 5000;
        document.getElementById('autoUpdates').checked = config.autoCheckUpdates !== false;
        document.getElementById('theme').value = config.theme || 'dark';
        
        currentLanguage = config.language || 'javascript';
        document.getElementById('languageSelect').value = currentLanguage;
        
        updateTemperatureValue(config.temperature || 0.2);
    } catch (error) {
        console.error('Erreur chargement config:', error);
    }
}

function setupTemperatureSlider() {
    const tempSlider = document.getElementById('temperature');
    tempSlider.addEventListener('input', function() {
        updateTemperatureValue(this.value);
    });
}

function updateTemperatureValue(value) {
    const tempValue = document.getElementById('tempValue');
    const val = parseFloat(value);
    
    let description = '';
    if (val <= 0.3) {
        description = ' (précis, peu créatif)';
    } else if (val <= 0.7) {
        description = ' (équilibré)';
    } else {
        description = ' (créatif, variabilité)';
    }
    
    tempValue.textContent = value + description;
}

async function saveSettings() {
    try {
        const config = {
            geminiApiKey: document.getElementById('geminiApiKey').value,
            aiModel: document.getElementById('aiModel').value,
            maxTokens: parseInt(document.getElementById('maxTokens').value),
            temperature: parseFloat(document.getElementById('temperature').value),
            sandboxTimeout: parseInt(document.getElementById('sandboxTimeout').value),
            autoCheckUpdates: document.getElementById('autoUpdates').checked,
            theme: document.getElementById('theme').value,
            language: document.getElementById('languageSelect').value
        };
        
        await window.electronAPI.saveConfig(config);
        
        showNotification('Paramètres sauvegardés avec succès!', 'success');
    } catch (error) {
        console.error('Erreur sauvegarde config:', error);
        showNotification('Erreur lors de la sauvegarde', 'error');
    }
}

// Connection test
async function testGeminiConnection() {
    const apiKey = document.getElementById('geminiApiKey').value;
    const connectionStatus = document.getElementById('connectionStatus');
    
    if (!apiKey) {
        connectionStatus.className = 'connection-status error visible';
        connectionStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> Veuillez entrer une clé API Gemini';
        return;
    }
    
    connectionStatus.className = 'connection-status visible';
    connectionStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Test de connexion en cours...';
    
    try {
        const result = await window.electronAPI.testGeminiConnection();
        
        if (result.success) {
            connectionStatus.className = 'connection-status success visible';
            connectionStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${result.message || 'Connexion à Gemini réussie!'}`;
            showNotification('Connexion à Gemini réussie!', 'success');
        } else {
            connectionStatus.className = 'connection-status error visible';
            connectionStatus.innerHTML = `<i class="fas fa-exclamation-circle"></i> Erreur: ${result.error || 'Connexion échouée'}`;
            showNotification(`Erreur: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Erreur test connexion:', error);
        connectionStatus.className = 'connection-status error visible';
        connectionStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> Erreur lors du test de connexion';
        showNotification('Erreur de connexion à Gemini', 'error');
    }
}

// Config event listeners
function setupEventListeners() {
    const codeEditor = document.getElementById('codeEditor');
    
    document.getElementById('languageSelect').addEventListener('change', function() {
        currentLanguage = this.value;
    });
    
    codeEditor.addEventListener('input', function() {
        currentCode = this.value;
        localStorage.setItem('wave_last_code', currentCode);
    });
    
    const savedCode = localStorage.getItem('wave_last_code');
    if (savedCode) {
        codeEditor.value = savedCode;
        currentCode = savedCode;
    }
    
    // Listeners IPC
    window.electronAPI.onOpenFileDialog(() => loadFile());
    window.electronAPI.onSaveFile(() => saveFile());
    window.electronAPI.onAnalyzeCode(() => analyzeCode());
    window.electronAPI.onRunSandbox(() => runSandbox());
    window.electronAPI.onAiCorrect(() => aiCorrect());
    window.electronAPI.onGenerateCode(() => showGenerateModal());
    window.electronAPI.onOpenSettings(() => {
        switchTab('settings');
    });
    window.electronAPI.onPasteToWave(async () => {
        const text = await window.electronAPI.getClipboardText();
        if (text) {
            const codeEditor = document.getElementById('codeEditor');
            codeEditor.value = text;
            currentCode = text;
            showNotification('Code collé avec succès!', 'success');
        }
    });
    
    // Update available listener
    window.electronAPI.onUpdateAvailable((event, data) => {
        showUpdatePanel(data);
    });
}

// Shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+O open file
        if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
            e.preventDefault();
            loadFile();
        }
        
        // Ctrl+S save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
        
        // F5 analyse
        if (e.key === 'F5') {
            e.preventDefault();
            analyzeCode();
        }
        
        // F6 sandbox
        if (e.key === 'F6') {
            e.preventDefault();
            runSandbox();
        }
        
        // F7 IA
        if (e.key === 'F7') {
            e.preventDefault();
            aiCorrect();
        }
        
        // F8 generate
        if (e.key === 'F8') {
            e.preventDefault();
            showGenerateModal();
        }
    });
}

function handleKeyDown(e) {
    // Intercepter Ctrl+V pour proposer Ctrl+V+W
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey) {
        setTimeout(() => {
            showNotification('Astuce: Utilisez Ctrl+C+W pour coller directement dans Wave', 'info', 3000);
        }, 100);
    }
}

async function loadFile() {
    try {
        const result = await window.electronAPI.openFile();
        if (result) {
            const codeEditor = document.getElementById('codeEditor');
            codeEditor.value = result.content;
            currentCode = result.content;
            currentFile = result.filePath;
            
            const ext = currentFile.split('.').pop().toLowerCase();
            const langMap = {
                'js': 'javascript', 'ts': 'typescript', 'py': 'python',
                'java': 'java', 'cpp': 'cpp', 'c': 'c',
                'html': 'html', 'css': 'css', 'php': 'php',
                'rb': 'ruby', 'go': 'go', 'rs': 'rust',
                'swift': 'swift', 'kt': 'kotlin', 'cs': 'csharp'
            };
            
            if (langMap[ext]) {
                currentLanguage = langMap[ext];
                document.getElementById('languageSelect').value = currentLanguage;
            }
            
            showNotification(`Fichier chargé: ${currentFile.split('/').pop()}`, 'success');
        }
    } catch (error) {
        console.error('Erreur chargement fichier:', error);
        showNotification('Erreur lors du chargement du fichier', 'error');
    }
}

// Save
async function saveFile() {
    const codeEditor = document.getElementById('codeEditor');
    currentCode = codeEditor.value;
    
    if (!currentCode.trim()) {
        showNotification('Aucun code à sauvegarder', 'warning');
        return;
    }
    
    try {
        const savedPath = await window.electronAPI.saveFile(currentCode);
        if (savedPath) {
            currentFile = savedPath;
            showNotification(`Fichier sauvegardé: ${savedPath.split('/').pop()}`, 'success');
        }
    } catch (error) {
        console.error('[FILES] Error saving', error);
        showNotification('Erreur lors de la sauvegarde', 'error');
    }
}

// Analyser le code
async function analyzeCode() {
    const codeEditor = document.getElementById('codeEditor');
    currentCode = codeEditor.value;
    
    if (!currentCode.trim()) {
        showNotification('Veuillez entrer du code à analyser', 'warning');
        return;
    }
    
    showLoading('analysisTab', 'Analyse en cours avec Gemini...');
    switchTab('analysis');
    
    try {
        const result = await window.electronAPI.aiAnalyze(currentCode, currentLanguage);
        
        if (result.error) {
            showNotification(result.error, 'error');
            removeLoading('analysisTab');
            return;
        }
        
        if (result.success) {
            displayAnalysisResults(result.analysis);
            showNotification('Analyse terminée avec succès!', 'success');
        } else {
            showNotification('Erreur lors de l\'analyse', 'error');
            removeLoading('analysisTab');
        }
    } catch (error) {
        console.error('[AI] Error analyzing', error);
        showNotification('Erreur lors de l\'analyse: ' + error.message, 'error');
        removeLoading('analysisTab');
    }
}

// Results display
function displayAnalysisResults(analysis) {
    const errorList = document.getElementById('errorList');
    
    if (!analysis.errors || analysis.errors.length === 0) {
        errorList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle" style="color: var(--success)"></i>
                <p>Aucune erreur détectée! Code propre et bien structuré.</p>
                ${analysis.score ? `<p style="margin-top: 10px; font-size: 12px;">Score: ${analysis.score}/100</p>` : ''}
                ${analysis.complexity ? `<p style="margin-top: 5px; font-size: 12px;">Complexité: ${analysis.complexity}</p>` : ''}
            </div>
        `;
        return;
    }
    
    let html = '';
    
    // Score
    if (analysis.score || analysis.complexity) {
        html += `<div class="ai-correction">
            <div class="ai-correction-header">
                <strong>Métriques de Qualité</strong>
            </div>
            <div class="ai-correction-body">
                <div class="improvement-stats">
                    ${analysis.score ? `
                    <div class="stat-item">
                        <div class="stat-label">Score</div>
                        <div class="stat-value ${analysis.score >= 80 ? 'improved' : analysis.score >= 60 ? '' : 'worse'}">
                            ${analysis.score}/100
                        </div>
                    </div>` : ''}
                    
                    ${analysis.complexity ? `
                    <div class="stat-item">
                        <div class="stat-label">Complexité</div>
                        <div class="stat-value ${analysis.complexity === 'low' ? 'improved' : analysis.complexity === 'medium' ? '' : 'worse'}">
                            ${analysis.complexity}
                        </div>
                    </div>` : ''}
                </div>
            </div>
        </div>`;
    }
    
    // Errors and warnings
    html += `<div class="ai-correction">
        <div class="ai-correction-header">
            <strong>Erreurs et Avertissements (${analysis.errors.length})</strong>
        </div>
        <div class="ai-correction-body">`;
    
    analysis.errors.forEach(error => {
        const typeColor = error.type === 'error' ? 'var(--error)' : 
                         error.type === 'warning' ? 'var(--warning)' : 'var(--accent)';
        const typeIcon = error.type === 'error' ? 'exclamation-circle' : 
                        error.type === 'warning' ? 'exclamation-triangle' : 'info-circle';
        
        html += `
            <div class="ai-explanation">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span><i class="fas fa-${typeIcon}" style="color: ${typeColor}"></i> 
                    Ligne ${error.line} - ${error.type.toUpperCase()}</span>
                    <span style="font-size: 12px; color: var(--text-secondary);">${error.type}</span>
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Message:</strong> ${error.message}
                </div>
                ${error.suggestion ? `
                <div>
                    <strong>Suggestion:</strong> ${error.suggestion}
                </div>` : ''}
            </div>
        `;
    });
    
    html += `</div></div>`;
    
    if (analysis.suggestions && analysis.suggestions.length > 0) {
        html += `<div class="ai-correction">
            <div class="ai-correction-header">
                <strong>Suggestions d'Amélioration</strong>
            </div>
            <div class="ai-correction-body">
                ${analysis.suggestions.map(suggestion => `
                    <div class="explanation-item">${suggestion}</div>
                `).join('')}
            </div>
        </div>`;
    }
    
    if (analysis.securityIssues && analysis.securityIssues.length > 0) {
        html += `<div class="ai-correction">
            <div class="ai-correction-header" style="border-left-color: var(--error);">
                <strong><i class="fas fa-shield-alt"></i> Problèmes de Sécurité</strong>
            </div>
            <div class="ai-correction-body">
                ${analysis.securityIssues.map(issue => `
                    <div class="explanation-item" style="color: var(--error);">
                        ${issue}
                    </div>
                `).join('')}
            </div>
        </div>`;
    }
    
    if (analysis.bestPractices && analysis.bestPractices.length > 0) {
        html += `<div class="ai-correction">
            <div class="ai-correction-header" style="border-left-color: var(--success);">
                <strong><i class="fas fa-star"></i> Bonnes Pratiques</strong>
            </div>
            <div class="ai-correction-body">
                ${analysis.bestPractices.map(practice => `
                    <div class="explanation-item" style="color: var(--success);">
                        ${practice}
                    </div>
                `).join('')}
            </div>
        </div>`;
    }
    
    errorList.innerHTML = html;
}

// Execute sandbox
async function runSandbox() {
    const codeEditor = document.getElementById('codeEditor');
    currentCode = codeEditor.value;
    
    if (!currentCode.trim()) {
        showNotification('Veuillez entrer du code à exécuter', 'warning');
        return;
    }
    
    showLoading('sandboxTab', 'Exécution en cours...');
    switchTab('sandbox');
    
    try {
        const result = await window.electronAPI.runInSandbox(currentCode, currentLanguage);
        
        const sandboxOutput = document.getElementById('sandboxOutput');
        
        if (result.success) {
            sandboxOutput.innerHTML = `
                <div class="sandbox-output success">
                    <div style="color: var(--success); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-check-circle"></i> Exécution réussie
                    </div>
                    <pre style="white-space: pre-wrap; background: var(--bg-primary); padding: 12px; border-radius: 4px;">${escapeHtml(result.output || 'Aucune sortie générée')}</pre>
                </div>
            `;
            showNotification('Exécution sandbox réussie!', 'success');
        } else {
            sandboxOutput.innerHTML = `
                <div class="sandbox-output error">
                    <div style="color: var(--error); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-exclamation-circle"></i> Erreur d'exécution
                    </div>
                    <pre style="white-space: pre-wrap; color: var(--error); background: var(--bg-primary); padding: 12px; border-radius: 4px;">${escapeHtml(result.error)}</pre>
                </div>
            `;
            showNotification('Erreur lors de l\'exécution', 'error');
        }
    } catch (error) {
        console.error('[SANDBOX] Error:', error);
        showNotification('Erreur sandbox: ' + error.message, 'error');
        removeLoading('sandboxTab');
    }
}

// Correction IA
async function aiCorrect() {
    const codeEditor = document.getElementById('codeEditor');
    currentCode = codeEditor.value;
    
    if (!currentCode.trim()) {
        showNotification('Veuillez entrer du code à corriger', 'warning');
        return;
    }
    
    showLoading('aiTab', 'Correction IA en cours avec Gemini...');
    switchTab('ai');
    
    try {
        const result = await window.electronAPI.aiCorrect(currentCode, currentLanguage);
        
        if (result.error) {
            showNotification(result.error, 'error');
            removeLoading('aiTab');
            return;
        }
        
        if (result.success) {
            currentCorrection = result.correction;
            displayAICorrection(result.correction);
            showNotification('Correction IA terminée!', 'success');
        } else {
            showNotification('Erreur lors de la correction IA', 'error');
            removeLoading('aiTab');
        }
    } catch (error) {
        console.error('[AI] Error correcting', error);
        showNotification('Erreur correction IA: ' + error.message, 'error');
        removeLoading('aiTab');
    }
}

function displayAICorrection(correction) {
    const aiResults = document.getElementById('aiResults');
    
    let html = `
        <div class="ai-correction">
            <div class="ai-correction-header">
                <strong>Code Corrigé et Optimisé</strong>
            </div>
            <div class="ai-correction-body">
    `;
    
    if (correction.correctedCode) {
        html += `
            <div class="code-comparison">
                <div class="code-block">
                    <div class="code-block-header">Code Original</div>
                    <div class="code-block-content">${escapeHtml(currentCode)}</div>
                </div>
                <div class="code-block">
                    <div class="code-block-header">Code Corrigé</div>
                    <div class="code-block-content">${escapeHtml(correction.correctedCode)}</div>
                </div>
            </div>
            
            <button class="btn primary apply-correction-btn" onclick="applyCorrection()">
                <i class="fas fa-check"></i> Appliquer la Correction
            </button>
        `;
    }
    
    if (correction.explanations && correction.explanations.length > 0) {
        html += `
            <div style="margin-top: 20px;">
                <h4><i class="fas fa-list"></i> Explications des Changements</h4>
                ${correction.explanations.map(exp => `
                    <div class="ai-explanation" style="margin: 10px 0;">
                        <strong>Ligne ${exp.line}:</strong> ${exp.change}
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                            <i class="fas fa-lightbulb"></i> ${exp.reason}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    if (correction.beforeAfter) {
        html += `
            <div style="margin-top: 20px;">
                <h4><i class="fas fa-chart-line"></i> Améliorations Apportées</h4>
                <div class="improvement-stats">
        `;
        
        for (const [metric, values] of Object.entries(correction.beforeAfter)) {
            const before = values.before;
            const after = values.after;
            const improved = after > before;
            
            html += `
                <div class="stat-item">
                    <div class="stat-label">${metric.charAt(0).toUpperCase() + metric.slice(1)}</div>
                    <div class="stat-value ${improved ? 'improved' : ''}">
                        ${before} → ${after}
                        ${improved ? '<i class="fas fa-arrow-up" style="margin-left: 5px;"></i>' : ''}
                    </div>
                </div>
            `;
        }
        
        html += `</div></div>`;
    }
    
    if (correction.improvements && correction.improvements.length > 0) {
        html += `
            <div style="margin-top: 20px;">
                <h4><i class="fas fa-check-circle"></i> Améliorations Apportées</h4>
                ${correction.improvements.map(imp => `
                    <div class="explanation-item">${imp}</div>
                `).join('')}
            </div>
        `;
    }
    
    html += `</div></div>`;
    aiResults.innerHTML = html;
}

function applyCorrection() {
    if (!currentCorrection || !currentCorrection.correctedCode) {
        showNotification('Aucune correction à appliquer', 'warning');
        return;
    }
    
    const codeEditor = document.getElementById('codeEditor');
    codeEditor.value = currentCorrection.correctedCode;
    currentCode = currentCorrection.correctedCode;
    
    showNotification('Correction appliquée avec succès!', 'success');
}

// Generate code
function showGenerateModal() {
    document.getElementById('generateModal').classList.add('active');
}

function closeGenerateModal() {
    document.getElementById('generateModal').classList.remove('active');
    document.getElementById('generatePrompt').value = '';
}

async function generateCode() {
    const prompt = document.getElementById('generatePrompt').value;
    const language = document.getElementById('generateLanguage').value;
    
    if (!prompt.trim()) {
        showNotification('Veuillez décrire le code à générer', 'warning');
        return;
    }
    
    closeGenerateModal();
    showLoading('analysisTab', 'Génération de code en cours...');
    switchTab('analysis');
    
    try {
        const result = await window.electronAPI.aiGenerate(prompt, language);
        
        if (result.error) {
            showNotification(result.error, 'error');
            removeLoading('analysisTab');
            return;
        }
        
        if (result.success) {
            const errorList = document.getElementById('errorList');
            errorList.innerHTML = `
                <div class="ai-correction">
                    <div class="ai-correction-header">
                        <strong>Code Généré - ${language.toUpperCase()}</strong>
                    </div>
                    <div class="ai-correction-body">
                        <div class="code-block">
                            <div class="code-block-header">Code Généré par Gemini</div>
                            <div class="code-block-content">${escapeHtml(result.code)}</div>
                        </div>
                        <button class="btn primary apply-correction-btn" onclick="insertGeneratedCode('${escapeHtml(result.code).replace(/'/g, "\\'")}')">
                            <i class="fas fa-code"></i> Insérer dans l'éditeur
                        </button>
                    </div>
                </div>
            `;
            
            showNotification('Code généré avec succès!', 'success');
        } else {
            showNotification('Erreur lors de la génération', 'error');
            removeLoading('analysisTab');
        }
    } catch (error) {
        console.error('[AI] Error generating:', error);
        showNotification('Erreur génération: ' + error.message, 'error');
        removeLoading('analysisTab');
    }
}

function insertGeneratedCode(code) {
    const codeEditor = document.getElementById('codeEditor');
    codeEditor.value = unescapeHtml(code);
    currentCode = codeEditor.value;
    showNotification('Code inséré dans l\'éditeur!', 'success');
}

// Tabs switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    if (tabName === 'settings') {
        document.querySelector('.tab-btn:last-child').classList.add('active');
    } else {
        document.querySelector(`.tab-btn[onclick*="${tabName}"]`).classList.add('active');
    }
}

function showLoading(tabId, message) {
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <p>${message}</p>
                <p style="color: var(--text-secondary); font-size: 12px; margin-top: 10px;">
                    Cela peut prendre quelques secondes...
                </p>
            </div>
        `;
    }
}

function removeLoading(tabId) {
    const tab = document.getElementById(tabId);
    if (tab && tab.querySelector('.loading')) {
        const contentId = tabId.replace('Tab', '');
        tab.innerHTML = `
            <div class="${contentId}" id="${contentId}">
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Une erreur est survenue lors du chargement</p>
                </div>
            </div>
        `;
    }
}

// Update verification
async function checkForUpdates() {
    showNotification('Vérification des mises à jour...', 'info');
    
    try {
        await window.electronAPI.checkUpdates();
        showNotification('Vous avez la dernière version!', 'success');
    } catch (error) {
        console.error('[UPDATE] Error checking updates:', error);
        showNotification('Impossible de vérifier les mises à jour', 'warning');
    }
}

// MAJ UI
function showUpdatePanel(data) {
    const updatePanel = document.getElementById('updatePanel');
    const latestVersion = document.getElementById('latestVersion');
    const changelog = document.getElementById('changelog');
    const downloadLink = document.getElementById('downloadLink');
    
    latestVersion.textContent = data.latest;
    changelog.textContent = data.changelog;
    downloadLink.href = data.downloadUrl;
    
    // Ouvrir le lien externe
    downloadLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.electronAPI.openExternal(data.downloadUrl);
    });
    
    updatePanel.style.display = 'block';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function unescapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.innerHTML = text;
    return div.textContent;
}

// Notifications
function showNotification(message, type = 'info', duration = 3000) {
    const existingNotif = document.querySelector('.notification');
    if (existingNotif) {
        existingNotif.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    // Notify styles
    Object.assign(notification.style, {
        position: 'fixed',
        top: '60px',
        right: '20px',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: '1000',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '14px',
        animation: 'slideIn 0.3s ease'
    });
    
    switch(type) {
        case 'success':
            notification.style.backgroundColor = '#4caf50';
            notification.style.color = 'white';
            break;
        case 'error':
            notification.style.backgroundColor = '#f44336';
            notification.style.color = 'white';
            break;
        case 'warning':
            notification.style.backgroundColor = '#ff9800';
            notification.style.color = 'white';
            break;
        default:
            notification.style.backgroundColor = '#2196f3';
            notification.style.color = 'white';
    }
    
    document.body.appendChild(notification);
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

function getNotificationIcon(type) {
    switch(type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
}
