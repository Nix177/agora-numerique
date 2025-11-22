import { API_BASE } from "../assets/config.js";

// --- ÉTAT DU JEU ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let CHAT_HISTORY = [];
let GAME_STATE = {}; 

// --- DOM ELEMENTS ---
const ui = {
    screen: document.getElementById('game-container'),
    teacherPanel: document.getElementById('teacher-controls'),
    teacherNote: document.getElementById('teacher-note-area')
};

// 1. INITIALISATION ROBUSTE
async function init() {
    console.log("Démarrage du moteur Shogun...");
    ui.teacherNote.innerText = "Initialisation en cours..."; // Feedback visuel

    try {
        // Fonction utilitaire pour charger un fichier avec vérification
        const loadFile = async (path) => {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`Fichier introuvable (${res.status}): ${path}`);
            // Vérifie que c'est bien du JSON et pas une page d'erreur HTML (le piège classique)
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") === -1) {
               // On tente quand même de parser, mais on prévient si ça casse
            }
            return await res.json();
        };

        // Chargement séquentiel pour identifier l'erreur exacte
        ui.teacherNote.innerText = "Chargement du scénario...";
        const scenario = await loadFile('data/scenario.json');
        
        ui.teacherNote.innerText = "Chargement des personnages...";
        const personas = await loadFile('data/personas.json');
        
        ui.teacherNote.innerText = "Chargement du monde...";
        const world = await loadFile('data/world.json');

        console.log("Données chargées avec succès !");
        GAME_DATA = { scenario, personas: mapPersonas(personas), world };
        GAME_STATE = scenario.state || {};
        
        loadScene(GAME_DATA.scenario.start);

    } catch (e) {
        console.error("Erreur critique:", e);
        // Affiche l'erreur en GROS sur l'écran du prof
        ui.teacherNote.innerHTML = `<span style="color:red; background:white; padding:5px;">ERREUR: ${e.message}</span>`;
        alert("Le jeu n'a pas pu démarrer.\n" + e.message);
    }
}

function mapPersonas(list) {
    const map = {};
    list.forEach(p => map[p.id] = p);
    return map;
}

// 2. MOTEUR DE SCÈNE
function loadScene(sceneId) {
    const scene = GAME_DATA.scenario.scenes[sceneId];
    if (!scene) return alert("ERREUR SCÉNARIO : La scène '" + sceneId + "' n'existe pas dans le fichier JSON.");

    CURRENT_SCENE = scene;
    updateScreen(scene);
    updateTeacherInterface(scene);
    
    if (scene.persona) {
        initChat(scene);
    }
}

// 3. AFFICHAGE ÉLÈVES
function updateScreen(scene) {
    document.body.style.backgroundImage = `url('${scene.background}')`;
    
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
        // Sécurité image
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
    
    if(ui.teacherNote) {
        ui.teacherNote.innerText = scene.teacherNote || "Phase narrative. Cliquez sur Suivant.";
    }

    if (scene.options) {
        scene.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn-choice';
            btn.innerHTML = `${opt.label}`;
            btn.onclick = () => {
                applyEffects(opt.effect);
                loadScene(opt.target);
            };
            ui.teacherPanel.appendChild(btn);
        });
    } 
    else if (scene.next) {
        const btn = document.createElement('button');
        btn.className = 'btn-next';
        btn.innerText = "Étape Suivante >>";
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

// 6. LE CHATBOT
async function initChat(scene) {
    CHAT_HISTORY = [];
    // Sécurité si le persona n'existe pas dans le JSON
    if (!GAME_DATA.personas[scene.persona]) {
        console.warn(`Persona '${scene.persona}' introuvable.`);
        return;
    }
    await callBot(scene.prompt, true);
}

window.sendUserMessage = async function(text) {
    const chatDiv = document.getElementById('chat-scroll');
    if(!chatDiv) return; // Sécurité
    
    chatDiv.innerHTML += `<div class="msg user">${text}</div>`;
    CHAT_HISTORY.push({ role: "user", content: text });
    
    // Sécurité persona
    const currentPersona = GAME_DATA.personas[CURRENT_SCENE.persona];
    const bio = currentPersona ? currentPersona.bio : "Tu es un assistant neutre.";

    const systemContext = `
        CONTEXTE JEU: ${JSON.stringify(GAME_STATE)}.
        SCENE ACTUELLE: ${JSON.stringify(CURRENT_SCENE.content)}.
        PERSONNAGE: ${bio}.
        CONSIGNE: ${CURRENT_SCENE.prompt}.
    `;
    
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
        const loader = document.getElementById(loadingId);
        if(loader) loader.remove();
        
        const reply = data.reply;
        chatDiv.innerHTML += `<div class="msg bot">${reply}</div>`;
        CHAT_HISTORY.push({ role: "assistant", content: reply });
        
        chatDiv.scrollTop = chatDiv.scrollHeight;

    } catch (e) {
        console.error(e);
        const loader = document.getElementById(loadingId);
        if(loader) loader.innerText = "Erreur connexion IA.";
    }
}

window.toggleFullScreen = function() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}

// Lancement
init();
