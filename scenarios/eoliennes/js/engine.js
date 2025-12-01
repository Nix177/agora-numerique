import { API_BASE } from "../assets/config.js";

// --- ÉTAT DU JEU ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let GAME_STATE = {};
let CHAT_SESSIONS = {}; 
let CURRENT_CHAT_TARGET = null; 
let GAME_MODE = 'standard';

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
        
        // Chargement local (chemins relatifs simples)
        const [scenario, personas, world] = await Promise.all([
            load('data/scenario.json'),
            load('data/personas.json'),
            load('data/world.json')
        ]);

        GAME_DATA = { scenario, personas: mapPersonas(personas), world };
        GAME_STATE = scenario.state || {};
        
        // Init sessions chat
        Object.keys(GAME_DATA.personas).forEach(id => CHAT_SESSIONS[id] = []);
        renderRoster();
        
        // Déblocage audio (Autoplay Policy)
        document.body.addEventListener('click', () => {
            const a = new Audio(); a.muted=true; a.play().catch(()=>{});
        }, {once:true});

        showModeSelection();

    } catch (e) {
        console.error("Erreur Init:", e);
        ui.screen.innerHTML = "<h1>Erreur chargement</h1><p>Vérifiez la console (F12) et les fichiers JSON.</p>";
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
    
    document.getElementById('btn-std').onclick = () => { GAME_MODE='standard'; loadScene(GAME_DATA.scenario.start); };
    document.getElementById('btn-ext').onclick = () => { GAME_MODE='extended'; loadScene(GAME_DATA.scenario.start); };
}

// 3. MOTEUR DE SCÈNE
function loadScene(sceneId) {
    const scene = GAME_DATA.scenario.scenes[sceneId];
    if (!scene) return alert("Scène introuvable: " + sceneId);

    // Gestion Événements Aléatoires (Mode Campagne)
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

    // Intro automatique du personnage si c'est la première fois
    if (scene.persona && CHAT_SESSIONS[scene.persona].length === 0 && scene.prompt) {
        callBot(scene.prompt, scene.persona, 'intro', true);
    }
}

// 4. AFFICHAGE (Images/Vidéos)
function updateScreen(scene) {
    // Fond Vidéo
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
    // Panneau Narratif
    if (scene.content) {
        html += `<div class="slide-content"><h1>${scene.content.title}</h1><p>${scene.content.text}</p></div>`;
    }
    // Boîte de Chat Principale
    if (scene.type === 'chat' || scene.persona) {
        const p = GAME_DATA.personas[scene.persona] || { name: '?', avatar: '' };
        html += `<div class="chat-box">
            <div class="avatar-header"><img src="${p.avatar}" class="avatar-img"><h3>${p.name}</h3></div>
            <div id="chat-scroll" style="display:flex; flex-direction:column;"></div>
        </div>`;
    }
    ui.screen.innerHTML = html;

    // Restaurer l'historique
    if (scene.persona) renderChatHistory(scene.persona, document.getElementById('chat-scroll'));
}

// 5. INTERFACE PROFESSEUR
function updateTeacherInterface(scene) {
    if(!ui.teacherPanel) return;
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

// 6. GESTION DU ROSTER (Latéral)
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

window.openSideChat = function(pid) {
    CURRENT_CHAT_TARGET = pid;
    const p = GAME_DATA.personas[pid];
    if(ui.modalTitle) ui.modalTitle.innerText = `Discussion avec ${p.name}`;
    if(ui.modal) ui.modal.style.display = 'flex';
    renderChatHistory(pid, ui.modalScroll);
}

window.closeSideChat = function() {
    if(ui.modal) ui.modal.style.display = 'none';
    // Retour au perso principal de la scène
    CURRENT_CHAT_TARGET = CURRENT_SCENE && CURRENT_SCENE.persona ? CURRENT_SCENE.persona : null;
}

function renderChatHistory(pid, container) {
    if(!container) return;
    container.innerHTML = '';
    (CHAT_SESSIONS[pid] || []).forEach(m => {
        container.innerHTML += `<div class="msg ${m.role==='user'?'user':'bot'}">${m.content}</div>`;
    });
    container.scrollTop = container.scrollHeight;
}

// 7. IA & MESSAGERIE (Unifiée)
// source = 'main' (bas) ou 'modal' (popup)
window.sendUserMessage = async function(text, source = 'main') {
    if (!text || !CURRENT_CHAT_TARGET) return;
    
    // Identifier la bonne boîte de dialogue
    const container = (source === 'modal') ? ui.modalScroll : document.getElementById('chat-scroll');
    if (!container) return;

    // Affichage Utilisateur
    container.innerHTML += `<div class="msg user">${text}</div>`;
    container.scrollTop = container.scrollHeight;
    
    // Historique
    if (!CHAT_SESSIONS[CURRENT_CHAT_TARGET]) CHAT_SESSIONS[CURRENT_CHAT_TARGET] = [];
    CHAT_SESSIONS[CURRENT_CHAT_TARGET].push({ role: 'user', content: text });
    
    // Reset Input
    if (source === 'modal' && ui.modalInput) ui.modalInput.value = '';
    if (source === 'main' && ui.mainInput) ui.mainInput.value = '';

    // Contexte IA
    const p = GAME_DATA.personas[CURRENT_CHAT_TARGET];
    let sceneCtx = (CURRENT_SCENE && CURRENT_SCENE.persona === CURRENT_CHAT_TARGET) 
        ? `CONSIGNE SCÈNE: ${CURRENT_SCENE.prompt}` : "";
    
    const sysPrompt = `CONTEXTE JEU: ${JSON.stringify(GAME_STATE)}. TON RÔLE: ${p.bio}. ${sceneCtx}`;

    await callBot(sysPrompt, CURRENT_CHAT_TARGET, source);
}

async function callBot(sys, targetId, source = 'main', isIntro = false) {
    const container = (source === 'modal') ? ui.modalScroll : document.getElementById('chat-scroll');

    let loadId = 'load-' + Date.now();
    if (container) {
        container.innerHTML += `<div id="${loadId}" class="msg bot">...</div>`;
        container.scrollTop = container.scrollHeight;
    }

    try {
        // Modèle choisi par le prof (ou défaut)
        const chosenModel = ui.modelSelect ? ui.modelSelect.value : "gpt-4o-mini";
        
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
            const loader = document.getElementById(loadId);
            if(loader) loader.remove();
            container.innerHTML += `<div class="msg bot">${reply}</div>`;
            container.scrollTop = container.scrollHeight;
        }
        
        if(!CHAT_SESSIONS[targetId]) CHAT_SESSIONS[targetId] = [];
        CHAT_SESSIONS[targetId].push({ role: 'assistant', content: reply });

        // TTS Automatique si coché
        if (ui.ttsCheck && ui.ttsCheck.checked && reply) {
            playTTS(reply, GAME_DATA.personas[targetId]);
        }

    } catch (e) {
        console.error(e);
        if(document.getElementById(loadId)) document.getElementById(loadId).innerText = "Erreur IA";
    }
}

// Fonction TTS (Cloud)
async function playTTS(text, persona) {
    try {
        const voiceId = persona.openaiVoice || "alloy";
        const cleanText = text.replace(/\*[^*]+\*/g, '').trim(); // Enlève les astérisques
        if(!cleanText) return;

        const res = await fetch(`${API_BASE}/tts?voice=${voiceId}&model=gpt-4o-mini-tts&format=mp3`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: cleanText })
        });
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
    } catch(e) { console.warn("TTS Error", e); }
}

// 8. LOG & SAUVEGARDE
window.saveGameLog = async function() {
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
    } catch(e) { alert("Erreur sauvegarde: " + e); }
}

init();
