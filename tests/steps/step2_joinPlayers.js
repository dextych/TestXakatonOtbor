const GameWebSocketClient = require('../websocket/gameWebSocketClient');
const roomApi = require('../../api/roomApi');
const config = require('../../config/testConfig');
const Logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

async function joinPlayers(roomIds, tokens, timingStats, socketEvents, playersPerLobby) {
    const stepStart = Date.now();
    Logger.step(`Вход игроков в ${roomIds.length} комнат (по ${playersPerLobby} игроков)`);
    
    const stompClients = [];
    const results = [];
    
    async function joinSingleRoom(roomIndex) {
        const roomId = roomIds[roomIndex];
        
        // 🔧 Собираем токены для N игроков из конфига
        const playerTokens = [];
        for (let i = 0; i < playersPerLobby; i++) {
            const tokenIndex = roomIndex * playersPerLobby + i;
            const token = tokens[tokenIndex]?.token;
            if (token) {
                playerTokens.push({ index: i, token });
            }
        }
        
        if (playerTokens.length === 0) {
            return { roomIndex, success: false, error: 'Нет токенов' };
        }
        // Используем токен первого игрока для WebSocket подключения
        const primaryToken = playerTokens[0].token;
        
        return new Promise((resolve) => {
            const client = new GameWebSocketClient(config.BASE_URL);
            
            const timeout = setTimeout(() => {
                resolve({ roomIndex, success: false, error: 'Таймаут' });
            }, 15000);
            
            client.connect(primaryToken)
                .then(async () => {
                    console.log(`[Комната ${roomIndex + 1}] WebSocket подключен`);
                    
                    // Подписки на события
                    client.subscribe(`/topic/room/${roomId}`, (data) => {
                        if (data.type === 'ROOM_UPDATED') {
                            socketEvents.push({ roomId, type: 'ROOM_UPDATED', data });
                            console.log(`[Комната ${roomIndex + 1}] ROOM_UPDATED: ${data.currentPlayers} игроков`);
                        }
                    });
                    
                    client.subscribe(`/topic/rooms`, (data) => {
                        if (data.type === 'ROOM_CREATED') {
                            socketEvents.push({ roomId, type: 'ROOM_CREATED', data });
                            console.log(`[Комната ${roomIndex + 1}] ROOM_CREATED`);
                        } else if (data.type === 'ROOM_FULL') {
                            socketEvents.push({ roomId, type: 'ROOM_FULL', data });
                            console.log(`[Комната ${roomIndex + 1}] ROOM_FULL`);
                        } else if (data.type === 'ROOM_STARTED') {
                            socketEvents.push({ roomId, type: 'ROOM_STARTED', data });
                            console.log(`[Комната ${roomIndex + 1}] ROOM_STARTED`);
                        }
                    });
                    
                    client.subscribe(`/topic/room/${roomId}/round`, (data) => {
                        socketEvents.push({ roomId, type: data.type, data });
                        
                        if (data.type === 'ROUND_STARTED') {
                            console.log(`[Комната ${roomIndex + 1}] ROUND_STARTED: раунд ${data.roundNumber}`);
                        } else if (data.type === 'BOOST_WINDOW_STARTED') {
                            console.log(`[Комната ${roomIndex + 1}] BOOST_WINDOW_STARTED`);
                            if (data.boostEffects) {
                                console.log(`  Эффекты буста:`, data.boostEffects);
                            }
                        } else if (data.type === 'WEIGHTS_REVEALED') {
                            console.log(`[Комната ${roomIndex + 1}] WEIGHTS_REVEALED получены`);
                            if (data.barrelWeights) {
                                console.log(`  Веса:`, data.barrelWeights);
                            }
                        } else if (data.type === 'ROUND_COMPLETED') {
                            console.log(`[Комната ${roomIndex + 1}] ROUND_COMPLETED`);
                        }
                    });
                    
                    try {
                        // 🔧 ПАРАЛЛЕЛЬНЫЙ ВХОД ВСЕХ ИГРОКОВ
                        const joinPromises = playerTokens.map(async (player) => {
                            try {
                                const joinResult = await roomApi.joinRoom(roomId, player.token);
                                
                                if (joinResult.success) {
                                    console.log(`[Комната ${roomIndex + 1}] Игрок ${player.index + 1} вошел`);
                                    return {
                                        playerIndex: player.index,
                                        participantId: joinResult.participantId,
                                        success: true
                                    };
                                } else {
                                    const errorText = typeof joinResult.data === 'string' 
                                        ? joinResult.data 
                                        : JSON.stringify(joinResult.data);
                                    console.error(`[Комната ${roomIndex + 1}] Игрок ${player.index + 1}: ${joinResult.status} - ${errorText}`);
                                    return {
                                        playerIndex: player.index,
                                        success: false,
                                        status: joinResult.status,
                                        error: errorText
                                    };
                                }
                            } catch (error) {
                                console.error(`[Комната ${roomIndex + 1}] Игрок ${player.index + 1}: ${error.message}`);
                                return {
                                    playerIndex: player.index,
                                    success: false,
                                    error: error.message
                                };
                            }
                        });
                        
                        const joinResults = await Promise.all(joinPromises);
                        
                        clearTimeout(timeout);
                        stompClients.push(client);
                        
                        const successfulJoins = joinResults.filter(r => r.success);
                        const allSuccess = successfulJoins.length === playerTokens.length;
                        
                        resolve({
                            roomIndex,
                            roomId,
                            success: allSuccess,
                            playersJoined: successfulJoins.length,
                            totalPlayers: playerTokens.length,
                            joinResults: joinResults,
                            client
                        });
                        
                    } catch (error) {
                        clearTimeout(timeout);
                        await client.disconnect();
                        resolve({ roomIndex, success: false, error: error.message });
                    }
                })
                .catch((error) => {
                    clearTimeout(timeout);
                    console.error(`[Комната ${roomIndex + 1}] Ошибка WebSocket:`, error);
                    resolve({ roomIndex, success: false, error: 'WebSocket failed' });
                });
        });
    }
    
    // 🔧 ПАРАЛЛЕЛЬНЫЙ ВХОД ВО ВСЕ КОМНАТЫ
    const promises = [];
    for (let i = 0; i < roomIds.length; i++) {
        promises.push(joinSingleRoom(i));
    }
    
    const allResults = await Promise.all(promises);
    results.push(...allResults);
    
    // 🔧 Считаем статистику по ИГРОКАМ, а не по комнатам
    const totalExpectedPlayers = roomIds.length * playersPerLobby;
    const successfulPlayers = allResults.reduce((sum, r) => sum + (r.playersJoined || 0), 0);
    const failedRooms = allResults.filter(r => !r.success).length;
    
    const duration = (Date.now() - stepStart) / 1000;
    timingStats.recordStep('playerJoin', duration);
    
    console.log(`\nСтатистика входа:`);
    console.log(`   Успешно вошло игроков: ${successfulPlayers}/${totalExpectedPlayers}`);
    console.log(`   Комнат с ошибками: ${failedRooms}/${roomIds.length}`);
    console.log(`   Время: ${duration.toFixed(2)}с`);
    
    allResults.filter(r => !r.success).forEach(r => {
        console.error(`   Комната ${r.roomIndex + 1}: ${r.error}`);
    });
    
    return { 
        results: allResults, 
        stompClients, 
        successful: successfulPlayers,
        totalExpected: totalExpectedPlayers,
        failedRooms 
    };
}

module.exports = joinPlayers;