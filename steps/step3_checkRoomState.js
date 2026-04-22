const roomApi = require('../api/roomApi');
const Logger = require('../utils/logger');

async function checkRoomState(results, timingStats) {
    const stepStart = Date.now();
    Logger.step('Проверка состояния комнат');
    
    const successfulRooms = results.filter(r => r.success);
    let correct = 0;
    
    for (const room of successfulRooms) {
        try {
            const result = await roomApi.getRoom(room.roomId);
            
            if (result.success) {
                const data = result.data;
                if (data.currentPlayerCount === 2 && data.status === 'WAITING') {
                    correct++;
                }
            }
        } catch (error) {
            // Игнорируем ошибки
        }
    }
    
    const duration = (Date.now() - stepStart) / 1000;
    timingStats.recordStep('stateCheck', duration);
    
    Logger.progress(correct, successfulRooms.length, 'корректных комнат');
    
    return { correct, total: successfulRooms.length };
}

module.exports = checkRoomState;