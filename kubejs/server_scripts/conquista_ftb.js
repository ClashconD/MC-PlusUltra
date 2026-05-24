// --- SISTEMA DE ESTANDARTE V8: SOBRESCRIBIR Y LIBERAR (FTB CHUNKS) ---
console.info("Cargando script de Conquista FTB Chunks V8...");

// 1. Cuando se COLOCA el estandarte:
BlockEvents.placed('minecraft:red_banner', event => {
    const player = event.player;
    const block = event.block;
    const server = event.server;
    const dimension = String(event.level.dimension); 

    // El jugador ejecuta su propio comando para reclamar 32 bloques de radio (5x5 chunks)
    player.runCommandSilent(`ftbchunks claim 32`);
    
    // Guardamos tu UUID para reconocerte después
    let coordKey = `${dimension}_${block.x}_${block.y}_${block.z}`;
    server.persistentData.putString(coordKey + "_UUID", player.uuid.toString());
    server.persistentData.putString(coordKey + "_Name", player.username);
    
    player.tell(Text.green("🛡 Estandarte colocado. Has reclamado una región de 5x5 chunks."));
});

// 2. Usamos CLICK DERECHO para interactuar con el estandarte
BlockEvents.rightClicked('minecraft:red_banner', event => {
    const player = event.player;
    const level = event.level;
    const block = event.block;
    const server = event.server;
    
    if (event.hand !== 'main_hand') return;

    const dimension = String(level.dimension);
    let coordKey = `${dimension}_${block.x}_${block.y}_${block.z}`;
    let duenoUUID = server.persistentData.getString(coordKey + "_UUID");
    let duenoNombre = server.persistentData.getString(coordKey + "_Name");

    if (!duenoUUID || duenoUUID === "") return; 

    // --- CASO 1: MODO CREATIVO O DUEÑO (Retirar pacíficamente) ---
    // Si eres el dueño, usas tu propio comando nativo para abandonar las tierras. ¡Nunca falla!
    if (player.isCreative() || player.uuid.toString() === duenoUUID) {
        player.runCommandSilent(`ftbchunks unclaim 32`);
        
        block.set('minecraft:air');
        server.persistentData.putString(coordKey + "_UUID", "");
        server.persistentData.putString(coordKey + "_Name", "");
        
        player.tell(Text.yellow("Has retirado el estandarte pacíficamente y liberado tu región de 5x5."));
        event.cancel();
        return; 
    }

    // --- CASO 2: ASEDIO ENEMIGO (Escáner de Tropas) ---
    const radioDeAsedio = 30;
    const tropasMinimas = 6;
    const aabb = AABB.of(block.x - radioDeAsedio, block.y - 15, block.z - radioDeAsedio, block.x + radioDeAsedio, block.y + 15, block.z + radioDeAsedio);
    
    const tropasCercanas = level.getEntitiesWithin(aabb).filter(entity => {
        return String(entity.type).includes("hundred");
    });

    if (tropasCercanas.length < tropasMinimas) {
        player.tell(Text.red(`⚔ Faltan tropas. Solo tienes ${tropasCercanas.length} soldados de los ${tropasMinimas} necesarios.`).bold());
        event.cancel();
        return; 
    }

    // --- CASO 3: SISTEMA DE COOLDOWN E ISLAS ---
    let siegesJSON = server.persistentData.getString('SiegesJSON');
    let sieges = siegesJSON ? JSON.parse(siegesJSON) : {};
    let ownerSieges = sieges[duenoUUID] || [];
    const now = Date.now();
    const doceHorasMs = 12 * 60 * 60 * 1000; 
    
    ownerSieges = ownerSieges.filter(s => (now - s.time) < doceHorasMs);
    let isSameIsland = false;
    
    for (let i = 0; i < ownerSieges.length; i++) {
        let s = ownerSieges[i];
        let dist = Math.sqrt(Math.pow(block.x - s.x, 2) + Math.pow(block.z - s.z, 2));
        if (dist <= 500) {
            isSameIsland = true;
            break;
        }
    }
    
    if (!isSameIsland) {
        if (ownerSieges.length >= 2) {
            player.tell(Text.red(`🛡 Asedio denegado: Cooldown de 12h activo en otras zonas de esta facción.`).bold());
            event.cancel();
            return;
        } else {
            ownerSieges.push({ x: block.x, z: block.z, time: now });
        }
    }

    sieges[duenoUUID] = ownerSieges;
    server.persistentData.putString('SiegesJSON', JSON.stringify(sieges));

    // --- EL ASEDIO TIENE ÉXITO (LA MAGIA OCURRE AQUÍ) ---
    
    // 1. El servidor obliga al juego a transferir todo el 5x5 al equipo del atacante.
    server.runCommandSilent(`execute in ${dimension} positioned ${block.x} ${block.y} ${block.z} run ftbchunks admin claim_as "${player.username}" 32`);
    
    // 2. Ahora que el atacante es el dueño de la base enemiga, la abandona de inmediato para que quede libre.
    player.runCommandSilent(`ftbchunks unclaim 32`);
    
    // 3. Rompemos el estandarte físicamente.
    block.set('minecraft:air');
    server.persistentData.putString(coordKey + "_UUID", "");
    server.persistentData.putString(coordKey + "_Name", "");

    server.tell(Text.gold(`🔥 ¡Bajo asedio, la base de `).append(Text.white(duenoNombre)).append(Text.gold(` ha sido destruida en [X: ${block.x}, Z: ${block.z}] y sus tierras han sido liberadas!`)).bold());
    event.cancel();
});