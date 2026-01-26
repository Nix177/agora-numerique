import { API_BASE } from "../assets/config.js";

// --- ÉTAT DU JEU ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let GAME_STATE = {};
let CHAT_SESSIONS = {};
let CURRENT_CHAT_TARGET = null;
let GAME_MODE = 'standard';
let SCENE_HISTORY = []; // Historique pour le bouton Retour

// --- DOM ELEMENTS ---
const ui = {
    screen: document.getElementById('game-container'),
    teacherPanel: document.getElementById('teacher-controls'),
    teacherNote: document.getElementById('teacher-note-area'),
    roster: document.getElementById('roster-bar'),
    modal: document.getElementById('side-chat-modal'),
    modalScroll: document.getElementById('modal-chat-scroll'),
    modalTitle: document.getElementById('modal-title'),
    modalInput: document.getElementById('modal-chat-input'),
    mainInput: document.getElementById('prof-chat-input'),
    // Réglages Prof
    modelSelect: document.getElementById('model-select'),
    ttsCheck: document.getElementById('tts-toggle')
};

// 1. INITIALISATION
async function init() {
    console.log("Moteur Éoliennes Démarré.");
    try {
        const load = async (p) => (await fetch(p)).json();

        // Chargement local
        const [scenario, personas, world] = await Promise.all([
            load('data/scenario.json'),
            load('data/personas.json'),
            load('data/world.json')
        ]);

        GAME_DATA = { scenario, personas: mapPersonas(personas), world };
        GAME_STATE = scenario.state || {};

        // Init sessions
        Object.keys(GAME_DATA.personas).forEach(id => CHAT_SESSIONS[id] = []);
        renderRoster();

        // Déblocage audio
        document.body.addEventListener('click', () => {
            const a = new Audio(); a.muted = true; a.play().catch(() => { });
        }, { once: true });

        showModeSelection();

    } catch (e) {
        console.error("Erreur Init:", e);
        ui.screen.innerHTML = "<h1>Erreur chargement</h1><p>Vérifiez les fichiers JSON.</p>";
    }
}

function mapPersonas(list) {
    const map = {};
    list.forEach(p => map[p.id] = p);
    return map;
}

// 2. SÉLECTION DU MODE
function showModeSelection() {
    ui.screen.innerHTML = `
        <div class="slide-content" style="background:rgba(0,0,0,0.9);">
            <h1>${GAME_DATA.scenario.meta?.title || "Belles-Terres"}</h1>
            <p>Choisissez le mode de session :</p>
            <div style="display:flex; gap:30px; justify-content:center; margin-top:40px;">
                <button id="btn-std" style="padding:20px; font-size:1.2em; background:#28a745; border:none; color:white; cursor:pointer; border-radius:10px;">Mode Standard (30min)</button>
                <button id="btn-ext" style="padding:20px; font-size:1.2em; background:#ff8800; border:none; color:white; cursor:pointer; border-radius:10px;">Mode Campagne (45min+)</button>
            </div>
        </div>`;

    document.getElementById('btn-std').onclick = () => { GAME_MODE = 'standard'; loadScene(GAME_DATA.scenario.start); };
    document.getElementById('btn-ext').onclick = () => { GAME_MODE = 'extended'; loadScene(GAME_DATA.scenario.start); };
}

// 3. MOTEUR SCÈNE
function loadScene(sceneId) {
    const scene = GAME_DATA.scenario.scenes[sceneId];
    if (!scene) return alert("Scène introuvable: " + sceneId);

    // --- Gestion Historique ---
    if (CURRENT_SCENE && CURRENT_SCENE.id !== sceneId && !window._isUndoing) {
        SCENE_HISTORY.push(CURRENT_SCENE.id);
    }
    window._isUndoing = false;

    // Events
    if (GAME_MODE === 'extended' && scene.allowEvents && !sceneId.startsWith('evt_') && Math.random() > 0.6) {
        const events = GAME_DATA.world.randomEvents;
        if (events && events.length) {
            const evt = events.splice(Math.floor(Math.random() * events.length), 1)[0];
            const evtScene = {
                id: evt.id, type: "chat", background: evt.background || "assets/bg_conseil.png",
                video: "assets/vid_evt_revolte.mp4", persona: "oracle", prompt: evt.prompt,
                content: { title: "⚠️ " + evt.title, text: evt.text },
                next: sceneId
            };
            CURRENT_SCENE = evtScene;
            CURRENT_CHAT_TARGET = "oracle";
            updateScreen(evtScene);
            updateTeacherInterface(evtScene);
            return;
        }
    }

    CURRENT_SCENE = scene;
    CURRENT_CHAT_TARGET = scene.persona || null;
    updateScreen(scene);
    updateTeacherInterface(scene);

    if (scene.persona && CHAT_SESSIONS[scene.persona].length === 0 && scene.prompt) {
        callBot(scene.prompt, scene.persona, 'main', true);
    }
}

// 4. AFFICHAGE
function updateScreen(scene) {
    let vidContainer = document.getElementById('video-bg');
    if (scene.video) {
        if (!vidContainer) {
            document.body.insertAdjacentHTML('afterbegin', `<div id="video-bg" style="position:absolute; inset:0; z-index:-1; background:black;"><video autoplay loop muted style="width:100%; height:100%; object-fit:cover; opacity:0.6;"><source src="${scene.video}"></video></div>`);
        } else {
            const v = vidContainer.querySelector('video');
            if (!v.src.includes(scene.video)) { v.src = scene.video; v.load(); }
        }
        document.body.style.backgroundImage = '';
    } else {
        if (vidContainer) vidContainer.remove();
        if (scene.background) document.body.style.backgroundImage = `url('${scene.background}')`;
    }

    let html = '';
    if (scene.content) html += `<div class="slide-content"><h1>${scene.content.title}</h1><p>${scene.content.text}</p></div>`;

    if (scene.type === 'chat' || scene.persona) {
        const p = GAME_DATA.personas[scene.persona] || { name: '?', avatar: '' };
        // --- MISE A JOUR : Header avec Avatar pour le Chat Principal ---
        html += `<div class="chat-box">
            <div class="avatar-header" style="display:flex; align-items:center; gap:15px; padding:15px; border-bottom:1px solid rgba(255,255,255,0.1);">
                <img src="${p.avatar}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:2px solid #ff8800;">
                <h3 style="margin:0; color:#ff8800; font-size:1.5em;">${p.name}</h3>
            </div>
            <div id="chat-scroll" style="display:flex; flex-direction:column; gap:15px; padding:10px;"></div>
        </div>`;
    }
    ui.screen.innerHTML = html;

    if (scene.persona) renderChatHistory(scene.persona, document.getElementById('chat-scroll'));
}

// 5. INTERFACE PROF
function updateTeacherInterface(scene) {
    if (!ui.teacherPanel) return;
    ui.teacherPanel.innerHTML = '';

    if (scene.options) {
        scene.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn-choice';
            btn.innerHTML = opt.label;
            btn.onclick = () => { applyEffects(opt.effect); loadScene(opt.target); };
            ui.teacherPanel.appendChild(btn);
        });
    } else if (scene.next) {
        const btn = document.createElement('button');
        btn.className = 'btn-next';
        btn.innerHTML = "Suite >>";
        btn.onclick = () => loadScene(scene.next);
        ui.teacherPanel.appendChild(btn);
    }
}

function applyEffects(eff) {
    for (let k in eff) GAME_STATE[k] = (GAME_STATE[k] || 0) + eff[k];
}

// 6. ROSTER & MODAL
function renderRoster() {
    if (!ui.roster) return;
    ui.roster.innerHTML = '';
    Object.values(GAME_DATA.personas).forEach(p => {
        const div = document.createElement('div');
        div.className = 'roster-btn';
        div.style.backgroundImage = `url('${p.avatar}')`;
        div.onclick = () => openSideChat(p.id);
        div.innerHTML = `<div class="roster-tooltip">${p.firstName}</div>`;
        ui.roster.appendChild(div);
    });
}

window.openSideChat = function (pid) {
    CURRENT_CHAT_TARGET = pid;
    const p = GAME_DATA.personas[pid];
    const avatarUrl = p.avatar || 'assets/avatars/default.png';

    if (ui.modalTitle) {
        ui.modalTitle.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px;">
                <img src="${avatarUrl}" style="height:50px; width:50px; border-radius:50%; border:2px solid #ff8800; object-fit:cover;">
                <span>${p.name}</span>
            </div>
        `;
    }

    if (ui.modal) ui.modal.style.display = 'flex';
    renderChatHistory(pid, ui.modalScroll);
}

window.closeSideChat = function () {
    if (ui.modal) ui.modal.style.display = 'none';
    CURRENT_CHAT_TARGET = CURRENT_SCENE && CURRENT_SCENE.persona ? CURRENT_SCENE.persona : null;
}

// --- FONCTION UTILITAIRE POUR L'AFFICHAGE DES MESSAGES (AVEC AVATAR) ---
function buildMsgHTML(role, content, personaId) {
    if (role === 'user') {
        return `<div class="msg user" style="align-self:flex-end; background:#333; color:#ddd;">${content}</div>`;
    } else {
        // C'est le bot : on affiche l'avatar à gauche + la bulle
        const p = GAME_DATA.personas[personaId] || {};
        const avatarUrl = p.avatar || 'assets/avatars/default.png';

        return `
        <div style="display:flex; align-items:flex-start; gap:10px; max-width:85%;">
            <img src="${avatarUrl}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid #ff8800; flex-shrink:0;">
            <div class="msg bot" style="background:#4a3b2a; border-left:4px solid #ff8800; color:white; margin:0;">
                ${content}
            </div>
        </div>`;
    }
}

function renderChatHistory(pid, container) {
    if (!container) return;
    container.innerHTML = '';
    (CHAT_SESSIONS[pid] || []).forEach(m => {
        container.innerHTML += buildMsgHTML(m.role, m.content, pid);
    });
    container.scrollTop = container.scrollHeight;
}

// 7. IA & TTS
window.sendUserMessage = async function (text, source = 'main') {
    if (!text || !CURRENT_CHAT_TARGET) return;

    const container = (source === 'modal') ? ui.modalScroll : document.getElementById('chat-scroll');
    if (!container) return;

    // Affiche message user
    container.innerHTML += buildMsgHTML('user', text, null);
    container.scrollTop = container.scrollHeight;

    if (!CHAT_SESSIONS[CURRENT_CHAT_TARGET]) CHAT_SESSIONS[CURRENT_CHAT_TARGET] = [];
    CHAT_SESSIONS[CURRENT_CHAT_TARGET].push({ role: 'user', content: text });

    if (source === 'modal' && ui.modalInput) ui.modalInput.value = '';
    if (source === 'main' && ui.mainInput) ui.mainInput.value = '';

    const p = GAME_DATA.personas[CURRENT_CHAT_TARGET];
    let sceneCtx = (CURRENT_SCENE && CURRENT_SCENE.persona === CURRENT_CHAT_TARGET) ? `CONSIGNE SCÈNE: ${CURRENT_SCENE.prompt}` : "";
    const sysPrompt = `CONTEXTE JEU: ${JSON.stringify(GAME_STATE)}. TON RÔLE: ${p.bio}. ${sceneCtx}`;

    await callBot(sysPrompt, CURRENT_CHAT_TARGET, source);
}

async function callBot(sys, targetId, source = 'main', isIntro = false) {
    const container = (source === 'modal') ? ui.modalScroll : document.getElementById('chat-scroll');

    let loadId = 'load-' + Date.now();
    if (container) {
        // Affiche le loader AVEC l'avatar
        const loadingHTML = buildMsgHTML('assistant', '...', targetId).replace('class="msg bot"', `id="${loadId}" class="msg bot"`);
        container.innerHTML += loadingHTML;
        container.scrollTop = container.scrollHeight;
    }

    try {
        const chosenModel = ui.modelSelect ? ui.modelSelect.value : "gpt-4o";

        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: isIntro ? [] : CHAT_SESSIONS[targetId],
                system: sys,
                model: chosenModel
            })
        });
        const data = await res.json();
        const reply = data.reply;

        if (container) {
            // On supprime le bloc de chargement
            const loaderEl = document.getElementById(loadId);
            if (loaderEl) loaderEl.parentElement.remove();
        }

        if (!CHAT_SESSIONS[targetId]) CHAT_SESSIONS[targetId] = [];
        CHAT_SESSIONS[targetId].push({ role: 'assistant', content: reply });

        // TTS (Note: Play full audio while text is typing? Or disable for now to avoid sync issues?)
        // For now, we play audio immediately. It might be faster than typing.
        if (ui.ttsCheck && ui.ttsCheck.checked && reply) {
            playTTS(reply, GAME_DATA.personas[targetId]);
        }

        if (container) {
            const chunks = splitMessage(reply);
            await playChunks(container, targetId, chunks);
        }

    } catch (e) {
        console.error(e);
        if (document.getElementById(loadId)) document.getElementById(loadId).innerText = "Erreur IA";
    }
}

// --- LOGIQUE TYPING & SUITE ---
async function playChunks(container, targetId, chunks) {
    for (let i = 0; i < chunks.length; i++) {
        // Création bulle vide logic
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = buildMsgHTML('assistant', '', targetId);
        const newMsgRow = tempDiv.firstElementChild; // The wrapper div
        container.appendChild(newMsgRow);

        // Target the actual text bubble inside. In Eoliennes, it's .msg.bot
        const bubble = newMsgRow.querySelector('.msg.bot');

        // Typing
        await typeWriter(bubble, chunks[i], 20);

        // Suite button
        if (i < chunks.length - 1) {
            await waitForNext(container);
        }
    }
}

function typeWriter(element, text, speed) {
    return new Promise(resolve => {
        let i = 0;
        element.classList.add('typing-cursor');
        const scrollTarget = element.closest('#chat-scroll') || element.closest('#modal-chat-scroll') || element.parentElement;

        function type() {
            if (i < text.length) {
                element.innerHTML += text.charAt(i);
                i++;
                if (scrollTarget) scrollTarget.scrollTop = scrollTarget.scrollHeight;
                setTimeout(type, speed);
            } else {
                element.classList.remove('typing-cursor');
                resolve();
            }
        }
        type();
    });
}

function waitForNext(container) {
    return new Promise(resolve => {
        const btn = document.createElement('button');
        btn.className = 'btn-suite-chat';
        btn.innerHTML = 'Suite ⇩';
        btn.onclick = () => {
            btn.remove();
            resolve();
        };
        container.appendChild(btn);
        container.scrollTop = container.scrollHeight;
    });
}

function splitMessage(text) {
    let rawChunks = text.split('\n\n');
    let finalChunks = [];
    rawChunks.forEach(chunk => {
        if (chunk.length > 500) {
            const sentences = chunk.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [chunk];
            let currentAcc = "";
            sentences.forEach(s => {
                if (currentAcc.length + s.length > 500) {
                    finalChunks.push(currentAcc.trim());
                    currentAcc = s;
                } else {
                    currentAcc += s;
                }
            });
            if (currentAcc.trim()) finalChunks.push(currentAcc.trim());
        } else {
            if (chunk.trim()) finalChunks.push(chunk.trim());
        }
    });
    return finalChunks;
}

async function playTTS(text, persona) {
    try {
        const voiceId = persona.openaiVoice || "alloy";
        const cleanText = text.replace(/\*[^*]+\*/g, '').trim();
        if (!cleanText) return;

        const res = await fetch(`${API_BASE}/tts?voice=${voiceId}&model=gpt-4o-mini-tts&format=mp3`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: cleanText })
        });
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
    } catch (e) { console.warn("TTS Error", e); }
}

// --- SAUVEGARDE & RETOUR (Version Eoliennes) ---

window.undoLastScene = function () {
    if (SCENE_HISTORY.length === 0) return alert("Impossible de reculer plus loin.");
    const prevId = SCENE_HISTORY.pop();
    window._isUndoing = true;
    loadScene(prevId);
    document.getElementById('settings-popup').style.display = 'none';
};

window.downloadSave = function () {
    const saveObj = {
        date: new Date().toISOString(),
        sceneId: CURRENT_SCENE.id,
        state: GAME_STATE,
        history: SCENE_HISTORY,
        chats: CHAT_SESSIONS,
        mode: GAME_MODE
    };
    const blob = new Blob([JSON.stringify(saveObj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `eoliennes_save_${new Date().toLocaleTimeString().replace(/:/g, '-')}.json`;
    a.click();
};

window.uploadSave = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            GAME_STATE = data.state || {};
            SCENE_HISTORY = data.history || [];
            CHAT_SESSIONS = data.chats || {};
            GAME_MODE = data.mode || 'standard';
            loadScene(data.sceneId);
            alert("Partie chargée !");
            document.getElementById('settings-popup').style.display = 'none';
        } catch (err) { alert("Fichier invalide"); }
    };
    reader.readAsText(file);
};

window.saveGameLog = async function () {
    const transcript = JSON.stringify({
        date: new Date().toISOString(),
        state: GAME_STATE,
        sessions: CHAT_SESSIONS
    }, null, 2);

    try {
        await fetch(`${API_BASE}/save`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sessionId: 'eolienne-log-' + Date.now(),
                transcript: transcript,
                classId: 'prof-demo',
                userId: 'master'
            })
        });
        alert("Sauvegarde réussie !");
    } catch (e) { alert("Erreur sauvegarde: " + e); }
}

init();
