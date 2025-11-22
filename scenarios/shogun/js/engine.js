window.sendUserMessage = async function(text) {
    const chatDiv = document.getElementById('chat-scroll');
    
    // SÉCURITÉ : Si la zone de chat n'existe pas (ex: on est sur une Slide d'intro), on arrête tout.
    if(!chatDiv) {
        console.warn("Pas de chat actif sur cette scène.");
        return; 
    }

    chatDiv.innerHTML += `<div class="msg user">${text}</div>`;
    CHAT_HISTORY.push({ role: "user", content: text });
    
    const systemContext = `
        CONTEXTE JEU: ${JSON.stringify(GAME_STATE)}.
        SCENE ACTUELLE: ${JSON.stringify(CURRENT_SCENE.content)}.
        PERSONNAGE: ${GAME_DATA.personas[CURRENT_SCENE.persona].bio}.
        CONSIGNE: ${CURRENT_SCENE.prompt}.
    `;
    
    await callBot(systemContext);
}
