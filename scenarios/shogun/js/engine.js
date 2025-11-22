import { API_BASE } from "../assets/config.js";

// --- ÉTAT DU JEU ---
let GAME_DATA = {};
let CURRENT_SCENE = null;
let CHAT_HISTORY = [];
let GAME_STATE = {}; // Pour stocker les scores (violence, richesse...)

// --- DOM ELEMENTS ---
const ui = {
    screen: document.getElementById('game-container'),
    teacherPanel: document.getElementById('teacher-controls'),
    teacherNote: document.getElementById('teacher-note-area') // Créez cette div dans le HTML prof
};

// 1. INITIALISATION
async function init() {
    console.log("Démarrage du moteur Shogun...");
    try {
        // Chargement parallèle pour aller vite
        const [scenario, personas, world] = await Promise.all([
            fetch('data/scenario.json').then(r => r.json()),
            fetch('data/personas.json').then(r => r.json()),
            fetch('data/world.json').then(r => r.json())
        ]);

        GAME_DATA = { scenario, personas: mapPersonas(personas), world };
        GAME_STATE = scenario.state || {};
        
        loadScene(GAME_DATA.scenario.start);
    } catch (e) {
        console.error("Erreur critique:", e);
        alert("Impossible de charger le jeu. Vérifiez la console (F12).");
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
    if (!scene) return alert("ERREUR: Scène introuvable -> " + sceneId);

    CURRENT_SCENE = scene;
    updateScreen(scene);
    updateTeacherInterface(scene);
    
    // Si c'est une scène avec Chat, on lance le bot
    if (scene.persona) {
        initChat(scene);
    }
}

// 3. AFFICHAGE ÉLÈVES (Le "Beamer")
function updateScreen(scene) {
    // Fond d'écran avec transition douce
    document.body.style.backgroundImage = `url('${scene.background}')`;
    
    let html = '';
    
    // Titres et textes narratifs
    if (scene.content) {
        html += `
            <div class="story-card slide-in">
                <h1>${scene.content.title}</h1>
                <p>${scene.content.text}</p>
            </div>
        `;
    }

    // Zone de Chat (si active)
    if (scene.persona) {
        const p = GAME_DATA.personas[scene.persona];
        html += `
            <div class="chat-box">
                <div class="avatar-container">
                    <img src="${p.avatar}" class="avatar-img">
                    <div class="avatar-name">${p.displayName}</div>
                </div>
                <div id="chat-scroll" class="chat-messages"></div>
            </div>
        `;
    }

    ui.screen.innerHTML = html;
}

// 4. INTERFACE PROFESSEUR (Le "Cockpit")
function updateTeacherInterface(scene) {
    ui.teacherPanel.innerHTML = ''; // Reset des boutons
    
    // Affichage des notes pédagogiques si présentes
    if(ui.teacherNote) {
        ui.teacherNote.innerText = scene.teacherNote || "Guidez les élèves.";
    }

    // CAS 1 : C'est un choix (Vote)
    if (scene.options) {
        scene.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn-choice';
            btn.innerHTML = `${opt.label}`; // On pourrait ajouter l'icône ici
            
            // Au clic : on applique les effets et on change de scène
            btn.onclick = () => {
                applyEffects(opt.effect);
                loadScene(opt.target);
            };
            ui.teacherPanel.appendChild(btn);
        });
    } 
    // CAS 2 : C'est linéaire (Juste "Suivant")
    else if (scene.next) {
        const btn = document.createElement('button');
        btn.className = 'btn-next';
        btn.innerText = "étape Suivante >>";
        btn.onclick = () => loadScene(scene.next);
        ui.teacherPanel.appendChild(btn);
    }
}

// 5. LOGIQUE DE JEU (État)
function applyEffects(effects) {
    if (!effects) return;
    for (let key in effects) {
        if (GAME_STATE[key] !== undefined) {
            GAME_STATE[key] += effects[key];
            console.log(`Stat mise à jour : ${key} = ${GAME_STATE[key]}`);
        }
    }
}

// 6. LE CHATBOT (Connecté à votre API existante)
async function initChat(scene) {
    CHAT_HISTORY = []; // Reset mémoire court terme
    const p = GAME_DATA.personas[scene.persona];
    
    // Message d'intro automatique du bot
    await callBot(scene.prompt, true);
}

// Fonction exposée globalement pour que l'input HTML puisse l'appeler
window.sendUserMessage = async function(text) {
    const chatDiv = document.getElementById('chat-scroll');
    chatDiv.innerHTML += `<div class="msg user">${text}</div>`;
    CHAT_HISTORY.push({ role: "user", content: text });
    
    // Prompt système contextuel
    const systemContext = `
        CONTEXTE JEU: ${JSON.stringify(GAME_STATE)}.
        SCENE ACTUELLE: ${JSON.stringify(CURRENT_SCENE.content)}.
        PERSONNAGE: ${GAME_DATA.personas[CURRENT_SCENE.persona].bio}.
        CONSIGNE: ${CURRENT_SCENE.prompt}.
    `;
    
    await callBot(systemContext);
}

async function callBot(systemPrompt, isIntro = false) {
    const chatDiv = document.getElementById('chat-scroll');
    if(!chatDiv) return;

    // Indicateur de frappe...
    const loadingId = 'loading-' + Date.now();
    chatDiv.innerHTML += `<div id="${loadingId}" class="msg bot">...</div>`;

    try {
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: isIntro ? [] : CHAT_HISTORY,
                system: systemPrompt,
                model: "gpt-4o-mini" // Rapide et efficace
            })
        });
        
        const data = await res.json();
        document.getElementById(loadingId).remove();
        
        const reply = data.reply;
        chatDiv.innerHTML += `<div class="msg bot">${reply}</div>`;
        CHAT_HISTORY.push({ role: "assistant", content: reply });
        
        // Auto-scroll
        chatDiv.scrollTop = chatDiv.scrollHeight;

    } catch (e) {
        console.error(e);
        document.getElementById(loadingId).innerText = "Erreur de connexion au Kami (IA).";
    }
}

// Lancement
init();