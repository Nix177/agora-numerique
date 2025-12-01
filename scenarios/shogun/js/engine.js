import { API_BASE } from "../assets/config.js";

// --- ÉTAT DU JEU ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
// let CHAT_HISTORY = []; // REMPLACÉ PAR CHAT_SESSIONS
let GAME_STATE = {};
let GAME_MODE = 'standard';

// --- NOUVEAU : GESTION MULTI-CHAT ---
let CHAT_SESSIONS = {}; // Stocke l'historique par persona { 'bragi': [], 'lia': [] }
let CURRENT_CHAT_TARGET = null; // Avec qui on parle actuellement

// --- DOM ELEMENTS ---
const ui = {
    screen: document.getElementById('game-container'),
    teacherPanel: document.getElementById('teacher-controls'),
    teacherNote: document.getElementById('teacher-note-area'),
    // Nouveaux éléments pour le chat parallèle
    roster: document.getElementById('roster-bar'),
    modal: document.getElementById('side-chat-modal'),
    modalScroll: document.getElementById('modal-chat-scroll'),
    modalTitle: document.getElementById('modal-title')
};

// 1. INITIALISATION
async function init() {
    console.log("Démarrage du moteur Shogun (Version Multi-Chat)...");
    if(ui.teacherNote) ui.teacherNote.innerText = "Initialisation...";

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
        
        // --- NOUVEAU : Initialiser les sessions de chat vides pour chaque perso ---
        Object.keys(GAME_DATA.personas).forEach(id => CHAT_SESSIONS[id] = []);
        renderRoster(); // Affiche les visages sur le côté
        
        showModeSelection();

    } catch (e) {
        console.error("Erreur:", e);
        if(ui.teacherNote) ui.teacherNote.innerHTML = `<span style="color:red">ERREUR CHARGEMENT</span>`;
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
            <p>Choisissez votre expérience de jeu.</p>
            <div style="display:flex; gap:30px; justify-content:center; margin-top:40px;">
                <button id="btn-mode-std" style="padding:20px 40px; font-size:1.2em; cursor:pointer; background:#28a745; color:white; border:none; border-radius:10px;">
                    Mode Standard (court)
                </button>
                <button id="btn-mode-ext" style="padding:20px 40px; font-size:1.2em; cursor:pointer; background:#ff8800; color:white; border:none; border-radius:10px;">
                    Mode Campagne (plusieurs séances)
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
    const scene = GAME_DATA.scenario.scenes[sceneId];
    if (!scene) return alert("ERREUR : Scène introuvable -> " + sceneId);

    // --- LOGIQUE ÉVÉNEMENT ALÉATOIRE (Mode Campagne) ---
    if (GAME_MODE === 'extended' && scene.allowEvents && !sceneId.startsWith('evt_') && Math.random() > 0.6) {
        const events = GAME_DATA.world.randomEvents;
        if (events && events.length > 0) {
            const randomEvt = events[Math.floor(Math.random() * events.length)];
            
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
            CURRENT_CHAT_TARGET = "oracle"; // Cible par défaut pour l'event
            updateScreen(evtScene);
            updateTeacherInterface(evtScene);
            // On ne reset pas l'historique global, on utilise la session
            return;
        }
    }

    CURRENT_SCENE = scene;
    
    // --- NOUVEAU : Définir la cible du chat principal ---
    if (scene.persona) {
        CURRENT_CHAT_TARGET = scene.persona;
    } else {
        CURRENT_CHAT_TARGET = null;
    }

    updateScreen(scene);
    updateTeacherInterface(scene);
    
    // Si c'est une scène de chat et qu'on n'a jamais parlé à ce perso, on lance l'intro
    if (scene.persona && CHAT_SESSIONS[scene.persona].length === 0 && scene.prompt) {
        callBot(scene.prompt, scene.persona, true);
    }
}

// 3. AFFICHAGE
function updateScreen(scene) {
    const videoContainer = document.getElementById('video-bg-container');
    
    // Gestion du fond (Vidéo ou Image) - VOTRE CODE INTACT
    if (scene.video) {
        if (!videoContainer) {
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
    
    // Scène narrative
    if (scene.content) {
        html += `
            <div class="slide-content">
                <h1>${scene.content.title}</h1>
                <p>${scene.content.text}</p>
            </div>
        `;
    }

    // Scène de Chat (Principale)
    if (scene.type === 'chat' || scene.persona) {
        const p = GAME_DATA.personas[scene.persona];
        const avatarUrl = p ? p.avatar : 'assets/avatar_esprit.png';
        const name = p ? p.displayName : 'Inconnu';

        html += `
            <div class="chat-box">
                <div class="avatar-header">
                    <img src="${avatarUrl}" class="avatar-img" onerror="this.style.display='none'">
                    <div class="avatar-name">${name}</div>
                </div>
                <div id="chat-scroll" class="chat-messages"></div>
            </div>
        `;
    }
    ui.screen.innerHTML = html;

    // Restaurer l'historique dans la boîte principale
    if (scene.persona) {
        renderChatHistory(scene.persona, document.getElementById('chat-scroll'));
    }
}

// 4. INTERFACE PROFESSEUR (VOTRE CODE INTACT)
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

// --- 5. NOUVEAU : GESTION DU ROSTER ET MODAL ---

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

window.openSideChat = function(personaId) {
    const p = GAME_DATA.personas[personaId];
    if (!p) return;

    CURRENT_CHAT_TARGET = personaId; // On parle maintenant à ce perso
    if(ui.modalTitle) ui.modalTitle.innerText = `Discussion avec ${p.name}`;
    if(ui.modal) ui.modal.style.display = 'flex';
    
    renderChatHistory(personaId, ui.modalScroll);
}

window.closeSideChat = function() {
    if(ui.modal) ui.modal.style.display = 'none';
    // On remet la cible sur le perso de la scène principale (s'il existe)
    if (CURRENT_SCENE && CURRENT_SCENE.persona) {
        CURRENT_CHAT_TARGET = CURRENT_SCENE.persona;
    } else {
        CURRENT_CHAT_TARGET = null;
    }
}

function renderChatHistory(personaId, container) {
    if(!container) return;
    container.innerHTML = '';
    const history = CHAT_SESSIONS[personaId] || [];
    history.forEach(msg => {
        container.innerHTML += `<div class="msg ${msg.role === 'user' ? 'user' : 'bot'}">${msg.content}</div>`;
    });
    container.scrollTop = container.scrollHeight;
}

// --- 6. GESTION DES MESSAGES (UNIFIÉE) ---

window.sendUserMessage = async function(text) {
    if(!text || !CURRENT_CHAT_TARGET) return;
    
    // On détermine où afficher le message (Main ou Modal)
    const container = (ui.modal && ui.modal.style.display === 'flex') 
        ? ui.modalScroll 
        : document.getElementById('chat-scroll');
    
    if(!container) return; // Pas de zone de chat active

    // Affichage local
    container.innerHTML += `<div class="msg user">${text}</div>`;
    container.scrollTop = container.scrollHeight;
    
    // Sauvegarde dans la session du perso cible
    if (!CHAT_SESSIONS[CURRENT_CHAT_TARGET]) CHAT_SESSIONS[CURRENT_CHAT_TARGET] = [];
    CHAT_SESSIONS[CURRENT_CHAT_TARGET].push({ role: "user", content: text });
    
    // Reset input
    document.getElementById('prof-chat-input').value = '';

    // Contextualisation IA
    const p = GAME_DATA.personas[CURRENT_CHAT_TARGET];
    // On utilise le prompt de la scène SI on est dans la scène principale, sinon juste la bio
    let sceneContext = "";
    if (CURRENT_SCENE && CURRENT_SCENE.persona === CURRENT_CHAT_TARGET) {
        sceneContext = `CONSIGNE SCÈNE: ${CURRENT_SCENE.prompt}`;
    }
    
    const systemPrompt = `CONTEXTE JEU: ${JSON.stringify(GAME_STATE)}. TON RÔLE: ${p.bio}. ${sceneContext}`;
    
    await callBot(systemPrompt, CURRENT_CHAT_TARGET);
}

async function callBot(systemPrompt, targetId, isIntro = false) {
    // Trouver le bon conteneur
    const container = (ui.modal && ui.modal.style.display === 'flex' && CURRENT_CHAT_TARGET === targetId) 
        ? ui.modalScroll 
        : (CURRENT_SCENE.persona === targetId ? document.getElementById('chat-scroll') : null);

    if (container) {
        const loadingId = 'loading-' + Date.now();
        container.innerHTML += `<div id="${loadingId}" class="msg bot">...</div>`;
        container.scrollTop = container.scrollHeight;
    }

    try {
        const history = CHAT_SESSIONS[targetId] || [];
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
        
        // Supprimer loader
        if (container) {
            // Nettoyage un peu bourrin mais efficace pour la maquette
            const loaders = container.querySelectorAll('.msg.bot');
            loaders.forEach(el => { if(el.innerText === '...') el.remove(); });
        }

        const reply = data.reply;
        
        if (container) {
            container.innerHTML += `<div class="msg bot">${reply}</div>`;
            container.scrollTop = container.scrollHeight;
        }
        
        if (!CHAT_SESSIONS[targetId]) CHAT_SESSIONS[targetId] = [];
        CHAT_SESSIONS[targetId].push({ role: "assistant", content: reply });

    } catch (e) {
        console.error(e);
    }
}

window.toggleFullScreen = function() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}

init();
