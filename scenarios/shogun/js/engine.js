import { API_BASE } from "../assets/config.js";

// --- ÉTAT DU JEU ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let SCENE_HISTORY = [];
let GAME_STATE = {};
let GAME_MODE = 'standard';

// --- GESTION MULTI-CHAT ---
let CHAT_SESSIONS = {};
let CURRENT_CHAT_TARGET = null;

// --- DOM ELEMENTS ---
const ui = {
    screen: document.getElementById('game-container'),
    teacherPanel: document.getElementById('teacher-controls'),
    teacherNote: document.getElementById('teacher-note-area'),
    roster: document.getElementById('roster-bar'),
    modal: document.getElementById('side-chat-modal'),
    modalScroll: document.getElementById('modal-chat-scroll'),
    modalTitle: document.getElementById('modal-title'),
    timerOverlay: document.getElementById('timer-overlay'),
    timerVal: document.getElementById('timer-val')
};

// --- AUDIO SYSTEM ---
let CURRENT_MUSIC = null;
const AUDIO_PLAYER = new Audio();
AUDIO_PLAYER.loop = true;
AUDIO_PLAYER.volume = 0.5;

// 1. INITIALISATION
async function init() {
    console.log("Démarrage du moteur Shogun (Version Multi-Chat 2.0 - Forced)...");
    if (ui.teacherNote) ui.teacherNote.innerText = "Initialisation...";

    try {
        const loadFile = async (path) => {
            console.log("Loading:", path);
            const res = await fetch(path);
            if (!res.ok) throw new Error(`Fichier manquant: ${path}`);
            return await res.json();
        };

        const [scenario, personasList, world] = await Promise.all([
            loadFile('data/scenario.json'),
            loadFile('data/personas.json'),
            loadFile('data/world.json')
        ]);

        console.log("Files loaded.");

        GAME_DATA = { scenario, personas: mapPersonas(personasList), world };
        GAME_STATE = scenario.state || {};

        Object.keys(GAME_DATA.personas).forEach(id => CHAT_SESSIONS[id] = []);
        renderRoster();

        console.log("Roster rendered.");
        showModeSelection();

    } catch (e) {
        console.error("Erreur CRITIQUE init:", e);
        if (ui.teacherNote) ui.teacherNote.innerHTML = `<span style="color:red">ERREUR CHARGEMENT: ${e.message}</span>`;
    }
}

function mapPersonas(list) {
    const map = {};
    list.forEach(p => map[p.id] = p);
    return map;
}

// --- SÉLECTION DU MODE ---
function showModeSelection() {
    ui.screen.innerHTML = `
        <div class="slide-content" style="background:rgba(0,0,0,0.9);">
            <h1>L'Aube du Shogun</h1>
            <p>Configuration de la séance :</p>
            <div style="display:flex; gap:30px; justify-content:center; margin-top:40px;">
                <button id="btn-mode-std" style="padding:20px 40px; font-size:1.2em; cursor:pointer; background:#28a745; color:white; border:none; border-radius:10px;">
                    Mode Standard (Rapide)
                </button>
                <button id="btn-mode-ext" style="padding:20px 40px; font-size:1.2em; cursor:pointer; background:#ff8800; color:white; border:none; border-radius:10px;">
                    Mode Prolongements (Complet)
                </button>
            </div>
        </div>
    `;

    document.getElementById('btn-mode-std').onclick = () => {
        GAME_MODE = 'standard';
        loadScene(GAME_DATA.scenario.start);
    };
    document.getElementById('btn-mode-ext').onclick = () => {
        GAME_MODE = 'extended';
        loadScene(GAME_DATA.scenario.start);
    };
}

// 2. MOTEUR DE SCÈNE
function loadScene(sceneId) {
    console.log("Loading Scene:", sceneId);
    const scene = GAME_DATA.scenario.scenes[sceneId];
    if (!scene) return alert("ERREUR : Scène introuvable -> " + sceneId);

    // --- Gestion Historique ---
    if (CURRENT_SCENE && CURRENT_SCENE.id !== sceneId && !window._isUndoing) {
        SCENE_HISTORY.push(CURRENT_SCENE.id);
    }
    window._isUndoing = false;

    // --- LOGIQUE ÉVÉNEMENT ALÉATOIRE ---
    if (GAME_MODE === 'extended' && scene.allowEvents && !sceneId.startsWith('evt_') && Math.random() > 0.6) {
        const events = GAME_DATA.world.randomEvents;
        if (events && events.length > 0) {
            const randomEvt = events[Math.floor(Math.random() * events.length)];
            console.log("Triggering Event:", randomEvt.id);

            const evtScene = {
                id: randomEvt.id,
                type: "chat",
                background: randomEvt.background || "assets/bg_conseil.png",
                video: "assets/vid_evt_revolte.mp4",
                persona: "oracle",
                prompt: randomEvt.prompt,
                teacherNote: "⚠️ ÉVÉNEMENT ! Demandez aux élèves de réagir.",
                content: { title: "⚠️ " + randomEvt.title, text: randomEvt.text },
                next: sceneId,
                allowEvents: false
            };

            GAME_DATA.world.randomEvents = events.filter(e => e !== randomEvt);

            CURRENT_SCENE = evtScene;
            CURRENT_CHAT_TARGET = "oracle";
            updateScreen(evtScene);
            updateTeacherInterface(evtScene);
            return;
        }
    }

    CURRENT_SCENE = scene;

    if (scene.persona) {
        CURRENT_CHAT_TARGET = scene.persona;
    } else {
        CURRENT_CHAT_TARGET = null;
    }

    updateScreen(scene);
    updateTeacherInterface(scene);

    if (scene.persona && CHAT_SESSIONS[scene.persona].length === 0 && scene.prompt) {
        console.log("Auto-calling bot for scene:", sceneId);
        callBot(scene.prompt, scene.persona, true);
    }
}

// 3. AFFICHAGE
function updateScreen(scene) {
    console.log("Updating Screen for:", scene.id);
    const videoContainer = document.getElementById('video-bg-container');

    if (scene.video) {
        if (!videoContainer) {
            console.log("Creating video container for:", scene.video);
            document.body.insertAdjacentHTML('afterbegin', `
                <div id="video-bg-container" style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:-1; overflow:hidden; background:black;">
                    <video autoplay loop muted playsinline style="width:100%; height:100%; object-fit:cover; opacity:0.6;">
                        <source src="${scene.video}" type="video/mp4">
                    </video>
                </div>
            `);
        } else {
            const v = videoContainer.querySelector('video source');
            if (!v.src.includes(scene.video)) {
                v.src = scene.video;
                videoContainer.querySelector('video').load();
            }
        }
        document.body.style.backgroundImage = 'none';
    } else {
        if (videoContainer) videoContainer.remove();
        if (scene.background) document.body.style.backgroundImage = `url('${scene.background}')`;
    }

    let html = '';

    if (scene.content) {
        html += `
            <div class="slide-content">
                <h1>${scene.content.title}</h1>
                <p>${scene.content.text}</p>
            </div>
        `;
    }

    // Scène de Chat (Principale) avec Avatars
    if (scene.type === 'chat' || scene.persona) {
        const p = GAME_DATA.personas[scene.persona];
        const avatarUrl = (p && p.avatar) ? p.avatar : 'assets/avatar_esprit.png';
        const name = p ? p.displayName : 'Inconnu';

        html += `
            <div class="chat-box">
                <div class="avatar-header">
                    <img src="${avatarUrl}" class="header-avatar-img" onerror="this.style.display='none'">
                    <div class="header-name">${name}</div>
                </div>
                <div id="chat-scroll" class="chat-messages"></div>
            </div>
        `;
    }
    ui.screen.innerHTML = html;

    if (scene.persona) {
        renderChatHistory(scene.persona, document.getElementById('chat-scroll'));
    }

    updateAudio(scene);
}

function updateAudio(scene) {
    if (scene.music) {
        if (CURRENT_MUSIC !== scene.music) {
            CURRENT_MUSIC = scene.music;
            AUDIO_PLAYER.src = scene.music;
            AUDIO_PLAYER.play().catch(e => console.log("Audio play blocked/error:", e));
        }
    }
}

// 4. INTERFACE PROFESSEUR
function updateTeacherInterface(scene) {
    ui.teacherPanel.innerHTML = '';

    // Timer Controls
    const timerDiv = document.createElement('div');
    timerDiv.style.display = 'flex'; timerDiv.style.gap = '5px'; timerDiv.style.marginRight = '15px';
    timerDiv.innerHTML = `
        <button class="btn-icon" onclick="window.startTimer(1)" title="1 min">⏳1</button>
        <button class="btn-icon" onclick="window.startTimer(2)" title="2 min">⏳2</button>
        <button class="btn-icon" onclick="window.startTimer(5)" title="5 min">⏳5</button>
    `;
    ui.teacherPanel.appendChild(timerDiv);

    if (ui.teacherNote) ui.teacherNote.innerText = scene.teacherNote || "Phase narrative.";

    if (scene.options) {
        scene.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn-choice';
            btn.innerHTML = opt.label;
            btn.onclick = () => { applyEffects(opt.effect); loadScene(opt.target); };
            ui.teacherPanel.appendChild(btn);
        });
    }
    else if (scene.next) {
        const btn = document.createElement('button');
        btn.className = 'btn-next';
        btn.innerText = "Suite >>";
        btn.onclick = () => loadScene(scene.next);
        ui.teacherPanel.appendChild(btn);
    }
}

function applyEffects(effects) {
    if (!effects) return;
    for (let key in effects) {
        if (GAME_STATE[key] !== undefined) {
            GAME_STATE[key] += effects[key];
        }
    }
}

// --- 5. GESTION DU ROSTER ET MODAL ---

function renderRoster() {
    if (!ui.roster) return;
    ui.roster.innerHTML = '';
    Object.values(GAME_DATA.personas).forEach(p => {
        const div = document.createElement('div');
        div.className = 'roster-btn';
        div.style.backgroundImage = `url('${p.avatar}')`;
        div.onclick = () => openSideChat(p.id);
        div.innerHTML = `<div class="roster-tooltip">${p.displayName || p.name}</div>`;
        ui.roster.appendChild(div);
    });
}

window.openSideChat = function (personaId) {
    const p = GAME_DATA.personas[personaId];
    if (!p) return;

    CURRENT_CHAT_TARGET = personaId;

    if (ui.modalTitle) {
        ui.modalTitle.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${p.avatar}" style="height:40px; width:40px; border-radius:50%; border:2px solid #ff8800; object-fit:cover;">
                <span>${p.name}</span>
            </div>`;
    }

    if (ui.modal) ui.modal.style.display = 'flex';
    renderChatHistory(personaId, ui.modalScroll);
}

window.closeSideChat = function () {
    if (ui.modal) ui.modal.style.display = 'none';
    if (CURRENT_SCENE && CURRENT_SCENE.persona) {
        CURRENT_CHAT_TARGET = CURRENT_SCENE.persona;
    } else {
        CURRENT_CHAT_TARGET = null;
    }
}

// --- FONCTION D'AFFICHAGE UNIFIÉE ---
function buildMsgHTML(role, text, personaId) {
    const isUser = role === 'user';
    let avatarImg = '';

    if (!isUser) {
        const p = GAME_DATA.personas[personaId];
        const url = (p && p.avatar) ? p.avatar : 'assets/avatar_esprit.png';
        avatarImg = `<img src="${url}" class="chat-avatar-img" alt="${personaId}">`;
    }

    return `
    <div class="msg-row ${isUser ? 'user' : 'bot'}">
        ${!isUser ? avatarImg : ''} 
        <div class="msg-bubble">${text}</div>
    </div>`;
}

function renderChatHistory(personaId, container) {
    if (!container) return;
    container.innerHTML = '';
    const history = CHAT_SESSIONS[personaId] || [];
    history.forEach(msg => {
        container.innerHTML += buildMsgHTML(msg.role, msg.content, personaId);
    });
    container.scrollTop = container.scrollHeight;
}

// --- 6. GESTION DES MESSAGES ---

window.sendUserMessage = async function (text) {
    if (!text || !CURRENT_CHAT_TARGET) return;

    const container = (ui.modal && ui.modal.style.display === 'flex')
        ? ui.modalScroll
        : document.getElementById('chat-scroll');

    if (!container) return;

    // Affichage local USER
    container.innerHTML += buildMsgHTML('user', text, null);
    container.scrollTop = container.scrollHeight;

    if (!CHAT_SESSIONS[CURRENT_CHAT_TARGET]) CHAT_SESSIONS[CURRENT_CHAT_TARGET] = [];
    CHAT_SESSIONS[CURRENT_CHAT_TARGET].push({ role: "user", content: text });

    document.getElementById('prof-chat-input').value = '';

    const p = GAME_DATA.personas[CURRENT_CHAT_TARGET];
    let sceneContext = "";
    if (CURRENT_SCENE && CURRENT_SCENE.persona === CURRENT_CHAT_TARGET) {
        sceneContext = `CONSIGNE SCÈNE: ${CURRENT_SCENE.prompt}`;
    }

    const systemPrompt = `CONTEXTE JEU: ${JSON.stringify(GAME_STATE)}. 
    TON RÔLE: ${p.bio}. 
    RÈGLE ABSOLUE: Tes réponses doivent être COURTES (Max 2 phrases, 40 mots). Tu parles à des enfants de 11 ans. Sois percutant, pas bavard.
    ${sceneContext}`;

    await callBot(systemPrompt, CURRENT_CHAT_TARGET);
}

async function callBot(systemPrompt, targetId, isIntro = false) {
    console.log("Calling Bot...", targetId);
    const container = (ui.modal && ui.modal.style.display === 'flex' && CURRENT_CHAT_TARGET === targetId)
        ? ui.modalScroll
        : (CURRENT_SCENE.persona === targetId ? document.getElementById('chat-scroll') : null);

    let loadingId = 'loading-' + Date.now();
    if (container) {
        // Loader stylisé
        const loaderHTML = buildMsgHTML('assistant', '...', targetId).replace('class="msg-row bot"', `id="${loadingId}" class="msg-row bot"`);
        container.innerHTML += loaderHTML;
        container.scrollTop = container.scrollHeight;
    }

    // Protection contre boucle infinie ou appels trop rapides ?
    try {
        const history = CHAT_SESSIONS[targetId] || [];
        console.log("Fetching chat...");
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: isIntro ? [] : history,
                system: systemPrompt,
                model: "gpt-4o-mini"
            })
        });
        const data = await res.json();
        const reply = data.reply;
        console.log("Reply received:", reply);

        // Suppression du loader
        if (container) {
            const loader = document.getElementById(loadingId);
            if (loader) loader.remove();
        }

        if (!CHAT_SESSIONS[targetId]) CHAT_SESSIONS[targetId] = [];
        CHAT_SESSIONS[targetId].push({ role: "assistant", content: reply });

        if (container) {
            // Découpage et affichage progressif
            const chunks = splitMessage(reply);
            await playChunks(container, targetId, chunks);
        }

    } catch (e) {
        console.error("Bot Error:", e);
        if (document.getElementById(loadingId)) document.getElementById(loadingId).remove();
    }
}

// --- LOGIQUE TYPING & SUITE ---
async function playChunks(container, targetId, chunks) {
    for (let i = 0; i < chunks.length; i++) {
        // Création bulle vide
        const msgHTML = buildMsgHTML('assistant', '', targetId);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = msgHTML;
        const newMsgRow = tempDiv.firstElementChild;
        container.appendChild(newMsgRow);

        const bubble = newMsgRow.querySelector('.msg-bubble');

        // Typing ~250 wpm -> 40ms/char
        await typeWriter(bubble, chunks[i], 40);

        // Si ce n'est pas le dernier chunk, on attend 1s (AUTO)
        if (i < chunks.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

function typeWriter(element, text, speed) {
    return new Promise(resolve => {
        let i = 0;
        element.classList.add('typing-cursor');

        function type() {
            if (i < text.length) {
                element.innerHTML += text.charAt(i);
                i++;
                // Auto scroll
                const scroller = element.closest('.chat-messages') || element.closest('#modal-chat-scroll');
                if (scroller) scroller.scrollTop = scroller.scrollHeight;
                setTimeout(type, speed);
            } else {
                element.classList.remove('typing-cursor');
                resolve();
            }
        }
        type();
    });
}

function splitMessage(text) {
    const MAX_WORDS = 70;
    const words = text.split(/\s+/);
    const chunks = [];
    let currentChunk = [];

    for (let w of words) {
        currentChunk.push(w);
        if (currentChunk.length >= MAX_WORDS && ['.', '!', '?'].includes(w.slice(-1))) {
            chunks.push(currentChunk.join(" "));
            currentChunk = [];
        }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk.join(" "));
    return chunks;
}

window.toggleFullScreen = function () {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}

// --- GESTION SAUVEGARDE & RETOUR ---

window.undoLastScene = function () {
    if (SCENE_HISTORY.length === 0) return alert("Impossible de reculer plus loin.");
    const prevId = SCENE_HISTORY.pop();
    window._isUndoing = true;
    loadScene(prevId);
};

window.downloadSave = function () {
    const saveObj = {
        date: new Date().toISOString(),
        sceneId: CURRENT_SCENE.id,
        state: GAME_STATE,
        history: SCENE_HISTORY,
        chats: CHAT_SESSIONS
    };
    const blob = new Blob([JSON.stringify(saveObj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shogun_save_${new Date().toLocaleTimeString().replace(/:/g, '-')}.json`;
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
            loadScene(data.sceneId);
            alert("Partie chargée !");
        } catch (err) { alert("Fichier invalide"); }
    };
    reader.readAsText(file);
};

// --- TIMER SYSTEM ---
let TIMER_INTERVAL = null;
window.startTimer = function (minutes) {
    if (TIMER_INTERVAL) clearInterval(TIMER_INTERVAL);
    let seconds = minutes * 60;

    if (ui.timerOverlay) ui.timerOverlay.style.display = 'flex';

    updateTimerDisplay(seconds);

    TIMER_INTERVAL = setInterval(() => {
        seconds--;
        updateTimerDisplay(seconds);
        if (seconds <= 0) {
            clearInterval(TIMER_INTERVAL);
            const alarm = new Audio('assets/sfx_gong.mp3');
            // alarm.play(); 
            if (ui.timerVal) ui.timerVal.style.color = 'red';
            setTimeout(() => { if (ui.timerOverlay) ui.timerOverlay.style.display = 'none'; }, 5000);
        }
    }, 1000);
}

window.stopTimer = function () {
    if (TIMER_INTERVAL) clearInterval(TIMER_INTERVAL);
    if (ui.timerOverlay) ui.timerOverlay.style.display = 'none';
    if (ui.timerVal) ui.timerVal.style.color = 'white';
}

function updateTimerDisplay(totalSeconds) {
    if (!ui.timerVal) return;
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    ui.timerVal.innerText = `${m}:${s}`;
}

init();
