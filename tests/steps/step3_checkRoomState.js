const roomApi = require('../../api/roomApi');
const Logger = require('../utils/logger');

async function checkRoomState(results, timingStats, expectedPlayers) {
    const stepStart = Date.now();
    Logger.step('Проверка состояния комнат');
    
    const successfulRooms = results.filter(r => r.success);
    let correct = 0;
    
    for (const room of successfulRooms) {
        try {
            const result = await roomApi.getRoom(room.roomId);
            
            if (result.success) {
                const data = result.data;
                // 🔧 Проверяем что игроков столько, сколько ожидалось из конфига
                if (data.currentPlayerCount === expectedPlayers && data.status === 'WAITING') {
                    correct++;
                    console.log(`  ✅ Комната ${room.roomIndex + 1}: ${data.currentPlayerCount}/${expectedPlayers} игроков, статус ${data.status}`);
                } else {
                    console.log(`  ⚠️ Комната ${room.roomIndex + 1}: ${data.currentPlayerCount}/${expectedPlayers} игроков, статус ${data.status}`);
                }
            }
        } catch (error) {
            console.error(`  ❌ Комната ${room.roomIndex + 1}: ошибка проверки`);
        }
    }
    
    const duration = (Date.now() - stepStart) / 1000;
    timingStats.recordStep('stateCheck', duration);
    
    Logger.progress(correct, successfulRooms.length, 'корректных комнат');
    
    return { correct, total: successfulRooms.length };
}

module.exports = checkRoomState;