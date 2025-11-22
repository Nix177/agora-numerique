import { API_BASE } from "../assets/config.js";

// --- ÉTAT DU JEU ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let CHAT_HISTORY = [];
let GAME_STATE = {};
let GAME_MODE = 'standard'; // Par défaut

// --- DOM ELEMENTS ---
const ui = {
    screen: document.getElementById('game-container'),
    teacherPanel: document.getElementById('teacher-controls'),
    teacherNote: document.getElementById('teacher-note-area')
};

// 1. INITIALISATION
async function init() {
    console.log("Démarrage du moteur Shogun...");
    ui.teacherNote.innerText = "Initialisation...";

    try {
        const loadFile = async (path) => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`Fichier manquant: ${path}`);
            return await res.json();
        };

        const [scenario, personas, world] = await Promise.all([
            loadFile('data/scenario.json'),
            loadFile('data/personas.json'),
            loadFile('data/world.json')
        ]);

        GAME_DATA = { scenario, personas: mapPersonas(personas), world };
        GAME_STATE = scenario.state || {};
        
        // Affiche l'écran de sélection de mode au lieu de lancer direct
        showModeSelection();

    } catch (e) {
        console.error("Erreur:", e);
        ui.teacherNote.innerHTML = `<span style="color:red">ERREUR: ${e.message}</span>`;
    }
}

function mapPersonas(list) {
    const map = {};
    list.forEach(p => map[p.id] = p);
    return map;
}

// --- SÉLECTION DU MODE (NOUVEAU) ---
function showModeSelection() {
    // On injecte l'écran de choix directement dans le container du jeu
    ui.screen.innerHTML = `
        <div class="slide-content" style="background:rgba(0,0,0,0.9); max-width:90%;">
            <h1>Configuration de la Session</h1>
            <p>Choisissez la durée de l'expérience.</p>
            <div style="display:flex; gap:30px; justify-content:center; margin-top:40px;">
                <button id="btn-mode-std" style="padding:20px 40px; font-size:1.5em; cursor:pointer; background:#28a745; color:white; border:none; border-radius:10px; transition:0.2s;">
                    <strong>Mode Standard</strong><br>
                    <span style="font-size:0.6em">Histoire directe (30 min)</span>
                </button>
                <button id="btn-mode-ext" style="padding:20px 40px; font-size:1.5em; cursor:pointer; background:#ff8800; color:white; border:none; border-radius:10px; transition:0.2s;">
                    <strong>Mode Campagne</strong><br>
                    <span style="font-size:0.6em">Avec événements aléatoires (45+ min)</span>
                </button>
            </div>
        </div>
    `;
    
    // On ajoute les écouteurs sur les boutons qu'on vient de créer
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
    const scene = GAME_DATA.scenario.scenes[sceneId];
    if (!scene) return alert("ERREUR : Scène introuvable -> " + sceneId);

    // --- LOGIQUE ÉVÉNEMENT ALÉATOIRE (Seulement en mode Extended) ---
    // Si on est en mode "Campagne", pas au début, et que la scène n'est pas déjà un événement
    if (GAME_MODE === 'extended' && sceneId !== GAME_DATA.scenario.start && !sceneId.startsWith('evt_') && Math.random() > 0.7) {
        console.log("Tentative d'événement aléatoire...");
        const events = GAME_DATA.world.randomEvents;
        
        // S'il y a des événements disponibles dans world.json
        if (events && events.length > 0) {
            const randomEvt = events[Math.floor(Math.random() * events.length)];
            
            // On construit une scène temporaire
            const evtScene = {
                id: randomEvt.id,
                type: "chat", // On utilise le chat pour présenter l'événement
                background: "assets/bg_conseil.png", 
                persona: "oracle",
                prompt: randomEvt.prompt,
                teacherNote: "⚠️ ÉVÉNEMENT IMPRÉVU ! Faites réagir la classe.",
                content: { title: "⚠️ " + randomEvt.title, text: randomEvt.text },
                next: sceneId // IMPORTANT : Après l'événement, on revient à la scène prévue
            };
            
            // On retire l'événement pour ne pas le rejouer
            GAME_DATA.world.randomEvents = events.filter(e => e !== randomEvt);
            
            // On charge cette scène spéciale
            CURRENT_SCENE = evtScene;
            updateScreen(evtScene);
            updateTeacherInterface(evtScene);
            initChat(evtScene);
            return; // On arrête le chargement normal pour l'instant
        }
    }

    CURRENT_SCENE = scene;
    updateScreen(scene);
    updateTeacherInterface(scene);
    
    if (scene.persona) {
        initChat(scene);
    }
}

// 3. AFFICHAGE ÉLÈVES
function updateScreen(scene) {
    if (scene.background) document.body.style.backgroundImage = `url('${scene.background}')`;
    
    let html = '';
    if (scene.content) {
        html += `
            <div class="slide-content">
                <h1>${scene.content.title}</h1>
                <p>${scene.content.text}</p>
            </div>
        `;
    }

    if (scene.persona) {
        const p = GAME_DATA.personas[scene.persona];
        const avatarUrl = p ? p.avatar : 'assets/avatar_esprit.png';
        const name = p ? p.displayName : 'Inconnu';

        html += `
            <div class="chat-box">
                <div class="avatar-container">
                    <img src="${avatarUrl}" class="avatar-img" onerror="this.style.display='none'">
                    <div class="avatar-name">${name}</div>
                </div>
                <div id="chat-scroll" class="chat-messages"></div>
            </div>
        `;
    }
    ui.screen.innerHTML = html;
}

// 4. INTERFACE PROFESSEUR
function updateTeacherInterface(scene) {
    ui.teacherPanel.innerHTML = ''; 
    
    if(ui.teacherNote) ui.teacherNote.innerText = scene.teacherNote || "Phase narrative.";

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

// 6. CHATBOT
async function initChat(scene) {
    CHAT_HISTORY = [];
    if (!GAME_DATA.personas[scene.persona]) return;
    await callBot(scene.prompt, true);
}

window.sendUserMessage = async function(text) {
    const chatDiv = document.getElementById('chat-scroll');
    if(!chatDiv) return;
    
    chatDiv.innerHTML += `<div class="msg user">${text}</div>`;
    CHAT_HISTORY.push({ role: "user", content: text });
    
    const bio = GAME_DATA.personas[CURRENT_SCENE.persona]?.bio || "Tu es neutre.";
    const systemContext = `CONTEXTE: ${JSON.stringify(GAME_STATE)}. PERSO: ${bio}. CONSIGNE: ${CURRENT_SCENE.prompt}`;
    
    await callBot(systemContext);
}

async function callBot(systemPrompt, isIntro = false) {
    const chatDiv = document.getElementById('chat-scroll');
    if(!chatDiv) return;

    const loadingId = 'loading-' + Date.now();
    chatDiv.innerHTML += `<div id="${loadingId}" class="msg bot">...</div>`;

    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: isIntro ? [] : CHAT_HISTORY,
                system: systemPrompt,
                model: "gpt-4o-mini"
            })
        });
        const data = await res.json();
        document.getElementById(loadingId).remove();
        
        const reply = data.reply;
        chatDiv.innerHTML += `<div class="msg bot">${reply}</div>`;
        CHAT_HISTORY.push({ role: "assistant", content: reply });
        chatDiv.scrollTop = chatDiv.scrollHeight;

    } catch (e) {
        console.error(e);
        const loader = document.getElementById(loadingId);
        if(loader) loader.innerText = "Erreur IA.";
    }
}

window.toggleFullScreen = function() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}

init();
