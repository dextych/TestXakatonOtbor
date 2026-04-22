const roundApi = require('../api/roundApi');
const config = require('../config/testConfig');
const Logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

async function round2(results, round1Results, socketEvents, timingStats) {
    const stepStart = Date.now();
    const subSteps = {};
    
    Logger.header('РАУНД 2');
    
    const successfulRooms = results.filter(r => r.success);
    
    if (!round1Results || !round1Results.roundResults) {
        console.log('Нет результатов первого раунда, пропускаем');
        return { success: false };
    }
    
    // 1. Определяем кто прошел в раунд 2
    console.log('1. Проверка кто прошёл в раунд 2...');
    
    const qualifiedRooms = [];
    
    for (const roomResult of round1Results.roundResults) {
        const room = successfulRooms.find(r => r.roomId === roomResult.roomId);
        if (!room) continue;
        
        const result = roomResult.result;
        const realPlayers = result.scores?.filter(s => !s.isBot) || [];
        
        const player1Qualified = realPlayers.some(p => p.rank === 1);
        const player2Qualified = realPlayers.some(p => p.rank === 2);
        
        if (player1Qualified || player2Qualified) {
            qualifiedRooms.push({
                ...room,
                player1Qualified,
                player2Qualified
            });
        }
        
        console.log(`[Комната ${room.roomIndex + 1}] Игрок 1: ${player1Qualified ? 'ПРОШЁЛ' : 'ВЫБЫЛ'}, Игрок 2: ${player2Qualified ? 'ПРОШЁЛ' : 'ВЫБЫЛ'}`);
    }
    
    if (qualifiedRooms.length === 0) {
        console.log('Нет комнат с прошедшими игроками, пропускаем раунд 2');
        return { success: false, qualifiedCount: 0 };
    }
    
    // 2. Ждем ROUND_STARTED для раунда 2
    console.log('\n2. Ожидание ROUND_STARTED для раунда 2...');
    
    const waitStart = Date.now();
    const roomsReady = new Set();
    
    while (roomsReady.size < qualifiedRooms.length && (Date.now() - waitStart) < 40000) {
        await sleep(2000);
        
        for (const room of qualifiedRooms) {
            if (!roomsReady.has(room.roomId)) {
                const hasRoundStarted = socketEvents.some(e => 
                    e.type === 'ROUND_STARTED' && 
                    e.data?.roundNumber === 2 && 
                    e.roomId === room.roomId
                );
                
                if (hasRoundStarted) {
                    roomsReady.add(room.roomId);
                    console.log(`  [Комната ${room.roomIndex + 1}] ROUND_STARTED получен`);
                }
            }
        }
    }
    
    console.log(`\nГотово комнат: ${roomsReady.size}/${qualifiedRooms.length}`);
    
    const readyRoomsList = qualifiedRooms.filter(r => roomsReady.has(r.roomId));
    
    if (readyRoomsList.length === 0) {
        console.log('Нет готовых комнат для раунда 2');
        return { success: false };
    }
    
    // 3. 🔧 ПАРАЛЛЕЛЬНЫЙ выбор бочек
    console.log('\n3. Выбор бочек в раунде 2 (параллельно)...');
    
    const selectStart = Date.now();
    
    // Создаем промисы для всех комнат
    const selectionPromises = readyRoomsList.map(async (room) => {
        try {
            await sleep(1000); // Задержка для каждой комнаты независимо
            
            const roomSelections = [];
            
            // Параллельный выбор для обоих игроков в одной комнате
            const playerPromises = [];
            
            if (room.player1Qualified) {
                const user1Token = config.TOKENS[room.roomIndex * 2]?.token;
                if (user1Token) {
                    playerPromises.push((async () => {
                        const barrelsRes = await roundApi.getBarrels(room.roomId, 2, user1Token);
                        if (barrelsRes.success) {
                            const selected = barrelsRes.data.slice(0, 3).map(b => b.id);
                            const selRes = await roundApi.selectBarrels(room.roomId, 2, selected, user1Token);
                            if (selRes.success) {
                                console.log(`[Комната ${room.roomIndex + 1}] Игрок 1 выбрал бочки`);
                                return { player: 1, success: true };
                            } else {
                                console.error(`[Комната ${room.roomIndex + 1}] Игрок 1: ошибка выбора - ${selRes.status}`);
                            }
                        }
                        return { player: 1, success: false };
                    })());
                }
            }
            
            if (room.player2Qualified) {
                const user2Token = config.TOKENS[room.roomIndex * 2 + 1]?.token;
                if (user2Token) {
                    playerPromises.push((async () => {
                        const barrelsRes = await roundApi.getBarrels(room.roomId, 2, user2Token);
                        if (barrelsRes.success) {
                            const selected = barrelsRes.data.slice(0, 3).map(b => b.id);
                            const selRes = await roundApi.selectBarrels(room.roomId, 2, selected, user2Token);
                            if (selRes.success) {
                                console.log(`[Комната ${room.roomIndex + 1}] Игрок 2 выбрал бочки`);
                                return { player: 2, success: true };
                            } else {
                                console.error(`[Комната ${room.roomIndex + 1}] Игрок 2: ошибка выбора - ${selRes.status}`);
                            }
                        }
                        return { player: 2, success: false };
                    })());
                }
            }
            
            const playerResults = await Promise.all(playerPromises);
            const successCount = playerResults.filter(r => r?.success).length;
            
            return { room, successCount };
            
        } catch (error) {
            console.error(`[Комната ${room.roomIndex + 1}] Ошибка:`, error.message);
            return { room, successCount: 0 };
        }
    });
    
    const selectionResults = await Promise.all(selectionPromises);
    const roomsWithSelection = selectionResults.reduce((sum, r) => sum + r.successCount, 0);
    
    subSteps.selection = (Date.now() - selectStart) / 1000;
    console.log(`\nРаунд 2: выбор сделан в ${roomsWithSelection} случаях`);
    
    // 4. Ждем ROUND_COMPLETED для раунда 2
    console.log('\n4. Ожидание ROUND_COMPLETED для раунда 2...');
    
    const completedStart = Date.now();
    const eventsBeforeCompleted2 = socketEvents.length;
    let round2CompletedEvents = [];
    const waitRound2End = Date.now();
    
    while (round2CompletedEvents.length < readyRoomsList.length && (Date.now() - waitRound2End) < 40000) {
        await sleep(2000);
        const newEvents = socketEvents.slice(eventsBeforeCompleted2);
        round2CompletedEvents = newEvents.filter(e => e.type === 'ROUND_COMPLETED');
    }
    
    subSteps.waitCompleted = (Date.now() - completedStart) / 1000;
    console.log(`ROUND_COMPLETED в ${round2CompletedEvents.length} комнатах`);
    
    // 5. 🔧 ПАРАЛЛЕЛЬНАЯ проверка финальных результатов
    console.log('\n5. Проверка финальных результатов (параллельно)...');
    
    const roomApi = require('../api/roomApi');
    
    const statusPromises = successfulRooms.map(async (room) => {
        try {
            const statusRes = await roomApi.getRoom(room.roomId);
            if (statusRes.success && statusRes.data.status === 'FINISHED') {
                console.log(`[Комната ${room.roomIndex + 1}] Статус: FINISHED`);
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    });
    
    const statusResults = await Promise.all(statusPromises);
    const roomsFinished = statusResults.filter(r => r).length;
    
    console.log(`\n=== РЕЗУЛЬТАТЫ РАУНДА 2 ===`);
    console.log(`Выбор бочек: ${roomsWithSelection}`);
    console.log(`Комнат со статусом FINISHED: ${roomsFinished}/${successfulRooms.length}`);
    
    const stepEnd = Date.now();
    timingStats.recordStepWithSubsteps('round2', {
        total: (stepEnd - stepStart) / 1000,
        ...subSteps
    });
    
    return {
        success: true,
        roomsFinished,
        totalRooms: successfulRooms.length,
        stats: {
            qualifiedCount: qualifiedRooms.length,
            selectionCount: roomsWithSelection,
            finishedCount: roomsFinished
        }
    };
}

module.exports = round2;