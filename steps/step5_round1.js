const roundApi = require('../api/roundApi');
const config = require('../config/testConfig');
const Logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

async function round1(results, socketEvents, timingStats) {
    const stepStart = Date.now();
    const subSteps = {};
    
    Logger.header('РАУНД 1');
    
    const successfulRooms = results.filter(r => r.success);
    
    // 1. Ждем ROUND_STARTED для раунда 1
    console.log('1. Ожидание ROUND_STARTED для раунда 1...');
    
    const roomsReady = new Set();
    const waitStart = Date.now();
    const maxWait = 60000;
    
    const waitStartR = Date.now();
    while (roomsReady.size < successfulRooms.length && (Date.now() - waitStart) < maxWait) {
        await sleep(2000);
        
        for (const room of successfulRooms) {
            if (!roomsReady.has(room.roomId)) {
                const hasRoundStarted = socketEvents.some(e => 
                    e.type === 'ROUND_STARTED' && 
                    e.data?.roundNumber === 1 && 
                    e.roomId === room.roomId
                );
                
                if (hasRoundStarted) {
                    roomsReady.add(room.roomId);
                    console.log(`  [Комната ${room.roomIndex + 1}] ROUND_STARTED получен`);
                }
            }
        }
    }
    subSteps.waitRoundStart = (Date.now() - waitStartR) / 1000;
    
    console.log(`\nГотово комнат: ${roomsReady.size}/${successfulRooms.length}`);
    
    if (roomsReady.size === 0) {
        console.log('❌ ROUND_STARTED не получен ни для одной комнаты, пропускаем тест');
        return { success: false };
    }
    
    const readyRoomsList = successfulRooms.filter(r => roomsReady.has(r.roomId));
    
    // 2. Выбираем бочки
    console.log('\n2. Выбор 3 бочек в раунде 1...');
    
    const selectStart = Date.now();
    const selectionRound1Results = [];
    
    for (const room of readyRoomsList) {
        try {
            const user1Token = config.TOKENS[room.roomIndex * 2]?.token;
            const user2Token = config.TOKENS[room.roomIndex * 2 + 1]?.token;
            
            if (!user1Token || !user2Token) continue;
            
            const [barrels1Res, barrels2Res] = await Promise.all([
                roundApi.getBarrels(room.roomId, 1, user1Token),
                roundApi.getBarrels(room.roomId, 1, user2Token)
            ]);
            
            if (!barrels1Res.success || !barrels2Res.success) {
                console.error(`[Комната ${room.roomIndex + 1}] Ошибка получения бочек: P1=${barrels1Res.status}, P2=${barrels2Res.status}`);
                continue;
            }
            
            const barrels1 = barrels1Res.data;
            const barrels2 = barrels2Res.data;
            
            const selected1 = barrels1.slice(0, 3).map(b => b.id);
            const selected2 = barrels2.slice(0, 3).map(b => b.id);
            
            const [sel1Res, sel2Res] = await Promise.all([
                roundApi.selectBarrels(room.roomId, 1, selected1, user1Token),
                roundApi.selectBarrels(room.roomId, 1, selected2, user2Token)
            ]);
            
            if (sel1Res.success && sel2Res.success) {
                console.log(`[Комната ${room.roomIndex + 1}] Бочки выбраны`);
                selectionRound1Results.push({
                    success: true,
                    roomId: room.roomId,
                    roomIndex: room.roomIndex,
                    barrels1: barrels1,
                    user1Token: user1Token,
                    user2Token: user2Token
                });
            } else {
                console.error(`[Комната ${room.roomIndex + 1}] Ошибка выбора: P1=${sel1Res.status}, P2=${sel2Res.status}`);
            }
            
        } catch (error) {
            console.error(`[Комната ${room.roomIndex + 1}] Ошибка:`, error.message);
        }
    }
    
    subSteps.selection = (Date.now() - selectStart) / 1000;
    console.log(`\nРаунд 1: выбор сделан в ${selectionRound1Results.length}/${readyRoomsList.length} комнатах`);
    
    if (selectionRound1Results.length === 0) {
        console.log('❌ Выбор бочек не удался ни в одной комнате');
        return { success: false };
    }
    
    // 3. 🔧 ПОКУПКА БУСТА ВО ВРЕМЯ РАУНДА (до BOOST_WINDOW_STARTED)
    console.log('\n3. Покупка буста во время раунда...');
    
    const buyBoostStart = Date.now();
    let boostsPurchased = 0;
    const purchasedRooms = [];
    
    // 🔧 Покупаем буст СРАЗУ после выбора бочек, не ждем никаких событий
    for (const roomResult of selectionRound1Results) {
        try {
            const user1Token = roomResult.user1Token;
            if (!user1Token) continue;
            
            console.log(`[Комната ${roomResult.roomIndex + 1}] Пытаемся купить буст...`);
            
            const boostResponse = await roundApi.buyBoost(roomResult.roomId, 1, user1Token);
            
            if (boostResponse.success) {
                boostsPurchased++;
                purchasedRooms.push(roomResult);
                console.log(`[Комната ${roomResult.roomIndex + 1}] ✅ Буст куплен`);
            } else {
                const errorText = typeof boostResponse.data === 'string' 
                    ? boostResponse.data 
                    : JSON.stringify(boostResponse.data);
                console.log(`[Комната ${roomResult.roomIndex + 1}] ❌ Буст не куплен: ${errorText}`);
            }
            
        } catch (error) {
            console.error(`[Комната ${roomResult.roomIndex + 1}] ❌ Ошибка при покупке буста:`, error.message);
        }
    }
    
    subSteps.buyBoost = (Date.now() - buyBoostStart) / 1000;
    console.log(`\nКуплено бустов: ${boostsPurchased}/${selectionRound1Results.length}`);
    
    // 4. 🔧 Ждем BOOST_WINDOW_STARTED (сервер сам применит буст)
    console.log('\n4. Ожидание BOOST_WINDOW_STARTED (автоматическое применение буста)...');
    
    const waitBoostWindowStart = Date.now();
    const eventsBeforeWindow = socketEvents.length;
    let boostWindowEvents = [];
    const waitWindow = Date.now();
    
    while (boostWindowEvents.length < readyRoomsList.length && (Date.now() - waitWindow) < 40000) {
        await sleep(1000);
        const newEvents = socketEvents.slice(eventsBeforeWindow);
        boostWindowEvents = newEvents.filter(e => e.type === 'BOOST_WINDOW_STARTED');
        
        const elapsed = Math.floor((Date.now() - waitWindow) / 1000);
        if (elapsed % 5 === 0) {
            console.log(`  Прошло ${elapsed}с, BOOST_WINDOW_STARTED: ${boostWindowEvents.length}/${readyRoomsList.length}`);
        }
    }
    
    subSteps.waitBoostWindow = (Date.now() - waitBoostWindowStart) / 1000;
    
    const allBoostWindowEvents = socketEvents.filter(e => e.type === 'BOOST_WINDOW_STARTED');
    console.log(`BOOST_WINDOW_STARTED получены! Событий: ${allBoostWindowEvents.length}`);
    
    // 🔧 Выводим эффекты буста из событий
    for (const event of allBoostWindowEvents) {
        const room = readyRoomsList.find(r => r.roomId === event.roomId);
        if (room && event.data?.boostEffects) {
            console.log(`[Комната ${room.roomIndex + 1}] Эффекты буста:`, event.data.boostEffects);
        }
    }
    
    // 5. Ждем ROUND_COMPLETED
    console.log('\n5. Ожидание ROUND_COMPLETED...');
    
    const eventsBeforeCompleted = socketEvents.length;
    let round1CompletedEvents = [];
    const waitRound1 = Date.now();
    
    while (round1CompletedEvents.length < readyRoomsList.length && (Date.now() - waitRound1) < 30000) {
        await sleep(2000);
        const newEvents = socketEvents.slice(eventsBeforeCompleted);
        round1CompletedEvents = newEvents.filter(e => e.type === 'ROUND_COMPLETED');
        
        const elapsed = Math.floor((Date.now() - waitRound1) / 1000);
        if (elapsed % 5 === 0) {
            console.log(`  Прошло ${elapsed}с, ROUND_COMPLETED: ${round1CompletedEvents.length}/${readyRoomsList.length}`);
        }
    }
    
    const allCompletedEvents = socketEvents.filter(e => e.type === 'ROUND_COMPLETED');
    console.log(`Всего ROUND_COMPLETED: ${allCompletedEvents.length}`);
    
    // 6. Проверяем результаты
    console.log('\n6. Результаты раунда 1:');
    
    const checkResultsStart = Date.now();
    let roomsWithResultsRound1 = 0;
    const roundResults = [];
    
    for (const room of readyRoomsList) {
        try {
            const resultRes = await roundApi.getRoundResult(room.roomId, 1);
            
            if (resultRes.success) {
                const result = resultRes.data;
                roomsWithResultsRound1++;
                console.log(`[Комната ${room.roomIndex + 1}] Победитель: ${result.winnerId?.slice(0, 8) || 'нет'}`);
                roundResults.push({
                    roomId: room.roomId,
                    roomIndex: room.roomIndex,
                    result: result
                });
            }
        } catch (error) {
            // Игнорируем
        }
    }
    
    subSteps.checkResults = (Date.now() - checkResultsStart) / 1000;
    
    // 7. 🔧 Ждем WEIGHTS_REVEALED (может прийти после)
    const allWeightsEvents = socketEvents.filter(e => e.type === 'WEIGHTS_REVEALED');
    if (allWeightsEvents.length > 0) {
        console.log(`\nWEIGHTS_REVEALED получены! Событий: ${allWeightsEvents.length}`);
        for (const event of allWeightsEvents) {
            const room = readyRoomsList.find(r => r.roomId === event.roomId);
            if (room && event.data?.barrelWeights) {
                console.log(`[Комната ${room.roomIndex + 1}] Веса:`, event.data.barrelWeights);
            }
        }
    }
    
    console.log(`\n=== РЕЗУЛЬТАТЫ РАУНДА 1 ===`);
    console.log(`Готово комнат: ${roomsReady.size}/${successfulRooms.length}`);
    console.log(`Выбор бочек: ${selectionRound1Results.length}/${readyRoomsList.length}`);
    console.log(`Куплено бустов: ${boostsPurchased}`);
    console.log(`BOOST_WINDOW_STARTED: ${allBoostWindowEvents.length}`);
    console.log(`WEIGHTS_REVEALED: ${allWeightsEvents.length}`);
    console.log(`ROUND_COMPLETED: ${allCompletedEvents.length}`);
    console.log(`Результаты получены: ${roomsWithResultsRound1}/${readyRoomsList.length}`);
    
    const stepEnd = Date.now();
    timingStats.recordStepWithSubsteps('round1', {
        total: (stepEnd - stepStart) / 1000,
        ...subSteps
    });
    
    return {
        success: true,
        selectionResults: selectionRound1Results,
        readyRooms: readyRoomsList,
        roundResults: roundResults,
        stats: {
            roomsReady: roomsReady.size,
            selectionCount: selectionRound1Results.length,
            boostsPurchased,
            boostWindowCount: allBoostWindowEvents.length,
            weightsCount: allWeightsEvents.length,
            completedCount: allCompletedEvents.length,
            resultsCount: roomsWithResultsRound1
        }
    };
}

module.exports = round1;