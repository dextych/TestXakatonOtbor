const GameWebSocketClient = require('../websocket/gameWebSocketClient');
const roomApi = require('../api/roomApi');
const config = require('../config/testConfig');
const Logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

async function joinPlayers(roomIds, tokens, timingStats, socketEvents) {
    const stepStart = Date.now();
    Logger.step(`Вход игроков в ${roomIds.length} комнат`);
    
    const stompClients = [];
    const results = [];
    
    async function joinSingleRoom(roomIndex) {
        const roomId = roomIds[roomIndex];
        const user1Token = tokens[roomIndex * 2]?.token;
        const user2Token = tokens[roomIndex * 2 + 1]?.token;
        
        if (!user1Token || !user2Token) {
            return { roomIndex, success: false, error: 'Нет токенов' };
        }
        
        return new Promise((resolve) => {
            const client = new GameWebSocketClient(config.BASE_URL);
            
            const timeout = setTimeout(() => {
                resolve({ roomIndex, success: false, error: 'Таймаут' });
            }, 15000);
            
            client.connect(user1Token)
                .then(async () => {
                    console.log(`[Комната ${roomIndex + 1}] WebSocket подключен`);
                    
                    // Подписки
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
                            // 🔧 Выводим эффекты буста если есть
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
                        // Вход первого игрока
                        const join1Result = await roomApi.joinRoom(roomId, user1Token);
                        
                        if (!join1Result.success) {
                            clearTimeout(timeout);
                            await client.disconnect();
                            
                            const errorText = typeof join1Result.data === 'string' 
                                ? join1Result.data 
                                : JSON.stringify(join1Result.data);
                            console.error(`[Комната ${roomIndex + 1}] P1 error body: ${errorText}`);
                            
                            resolve({ 
                                roomIndex, 
                                success: false, 
                                error: `P1: ${join1Result.status} - ${errorText}` 
                            });
                            return;
                        }
                        
                        await sleep(500);
                        
                        // Вход второго игрока
                        const join2Result = await roomApi.joinRoom(roomId, user2Token);
                        
                        if (!join2Result.success) {
                            clearTimeout(timeout);
                            await client.disconnect();
                            resolve({ 
                                roomIndex, 
                                success: false, 
                                error: `P2: ${join2Result.status}` 
                            });
                            return;
                        }
                        
                        clearTimeout(timeout);
                        stompClients.push(client);
                        
                        resolve({
                            roomIndex,
                            roomId,
                            success: true,
                            player1Id: join1Result.participantId,
                            player2Id: join2Result.participantId,
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
    
    const promises = [];
    for (let i = 0; i < roomIds.length; i++) {
        promises.push(joinSingleRoom(i));
    }
    
    const allResults = await Promise.all(promises);
    results.push(...allResults);
    
    const successful = allResults.filter(r => r.success).length;
    const failed = allResults.filter(r => !r.success).length;
    
    allResults.filter(r => !r.success).forEach(r => {
        console.error(`Комната ${r.roomIndex + 1}: ${r.error}`);
    });
    
    const duration = (Date.now() - stepStart) / 1000;
    timingStats.recordStep('playerJoin', duration);
    
    console.log(`\nУспешно заполнено: ${successful}/${roomIds.length}`);
    console.log(`Ошибок: ${failed}`);
    console.log(`Время: ${duration.toFixed(2)}с`);
    
    return { results: allResults, stompClients, successful, failed };
}

module.exports = joinPlayers;