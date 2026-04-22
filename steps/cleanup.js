const fs = require('fs');
const Logger = require('../utils/logger');

async function cleanup(testContext, timingStats) {
    Logger.header('Завершение тестов, закрытие соединений');
    
    // Закрываем все STOMP клиенты
    const { stompClients, results, socketEvents, roomIds } = testContext;
    
    for (const client of stompClients) {
        try {
            if (client && client.isConnected()) {
                await client.disconnect();
            }
        } catch (e) {
            // Игнорируем
        }
    }
    
    // Закрываем клиенты из results
    for (const r of results) {
        try {
            if (r.client && r.client.isConnected()) {
                await r.client.disconnect();
            }
        } catch (e) {
            // Игнорируем
        }
    }
    
    timingStats.finalize();
    const totalTime = timingStats.getTotalSec();
    const gameTime = timingStats.getGameTime();
    const activeTime = timingStats.getActiveTime();
    
    // Вывод статистики
    Logger.header('РЕАЛЬНОЕ ВРЕМЯ ВЫПОЛНЕНИЯ');
    console.log(`Чистое игровое время: ${String(gameTime.toFixed(1)).padStart(5)} сек`);
    console.log(`Активное время (действия): ${String(activeTime.toFixed(1)).padStart(5)} сек`);
    console.log('Детализация по этапам:');
    
    if (timingStats.steps.roomCreation) {
        console.log(`  Создание комнат: ${String(timingStats.steps.roomCreation.toFixed(1)).padStart(5)} сек`);
    }
    if (timingStats.steps.playerJoin) {
        console.log(`  Вход игроков: ${String(timingStats.steps.playerJoin.toFixed(1)).padStart(5)} сек`);
    }
    if (timingStats.steps.botFill) {
        console.log(`  Ожидание бота: ${String(timingStats.steps.botFill.toFixed(1)).padStart(5)} сек`);
    }
    
    // Раунд 1
    if (timingStats.steps.round1) {
        console.log(`  РАУНД 1 (всего): ${String(timingStats.steps.round1.total.toFixed(1)).padStart(5)} сек`);
        if (timingStats.steps.round1.waitRoundStart) {
            console.log(`    ожидание старта: ${String(timingStats.steps.round1.waitRoundStart.toFixed(1)).padStart(5)} сек`);
        }
        if (timingStats.steps.round1.selection) {
            console.log(`    выбор бочек: ${String(timingStats.steps.round1.selection.toFixed(1)).padStart(5)} сек`);
        }
        if (timingStats.steps.round1.waitWeights) {
            console.log(`    ожидание весов: ${String(timingStats.steps.round1.waitWeights.toFixed(1)).padStart(5)} сек`);
        }
        if (timingStats.steps.round1.buyBoost) {
            console.log(`    покупка буста: ${String(timingStats.steps.round1.buyBoost.toFixed(1)).padStart(5)} сек`);
        }
        if (timingStats.steps.round1.applyBoost) {
            console.log(`    применение буста: ${String(timingStats.steps.round1.applyBoost.toFixed(1)).padStart(5)} сек`);
        }
    }
    
    // Раунд 2
    if (timingStats.steps.round2) {
        console.log(`  РАУНД 2 (всего): ${String(timingStats.steps.round2.total.toFixed(1)).padStart(5)} сек`);
        if (timingStats.steps.round2.checkQualified) {
            console.log(`    проверка квалификации: ${String(timingStats.steps.round2.checkQualified.toFixed(1)).padStart(5)} сек`);
        }
        if (timingStats.steps.round2.waitRoundStart) {
            console.log(`    ожидание старта: ${String(timingStats.steps.round2.waitRoundStart.toFixed(1)).padStart(5)} сек`);
        }
        if (timingStats.steps.round2.selection) {
            console.log(`    выбор бочек: ${String(timingStats.steps.round2.selection.toFixed(1)).padStart(5)} сек`);
        }
        if (timingStats.steps.round2.buyBoost) {
            console.log(`    покупка буста: ${String(timingStats.steps.round2.buyBoost.toFixed(1)).padStart(5)} сек`);
        }
    }
    
    // Сохраняем отчет в JSON
    const config = require('../config/testConfig');
    const report = {
        timestamp: new Date().toISOString(),
        gameTimeSec: gameTime,
        activeTimeSec: activeTime,
        totalTimeSec: totalTime,
        steps: timingStats.steps,
        rooms: {
            total: config.LOBBIES_COUNT,
            created: roomIds.length,
            filled: results.filter(r => r.success).length
        },
        events: {
            roomStarted: socketEvents.filter(e => e.type === 'ROOM_STARTED').length,
            round1Started: socketEvents.filter(e => e.type === 'ROUND_STARTED' && e.data?.roundNumber === 1).length,
            round2Started: socketEvents.filter(e => e.type === 'ROUND_STARTED' && e.data?.roundNumber === 2).length,
            weightsRevealed: socketEvents.filter(e => e.type === 'WEIGHTS_REVEALED').length,
            boostWindow: socketEvents.filter(e => e.type === 'BOOST_WINDOW_STARTED').length,
            roundCompleted: socketEvents.filter(e => e.type === 'ROUND_COMPLETED').length
        }
    };
    
    fs.writeFileSync('timing-report.json', JSON.stringify(report, null, 2));
    Logger.info('Отчет сохранен в timing-report.json');
    
    // Очищаем массивы
    testContext.stompClients = [];
    testContext.socketEvents = [];
    
    await new Promise(resolve => setTimeout(resolve, 1000));
}

module.exports = cleanup;