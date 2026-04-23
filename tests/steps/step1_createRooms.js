const roomApi = require('../../api/roomApi');
const Logger = require('../utils/logger');

async function createRooms(lobbiesCount, timingStats) {
    const stepStart = Date.now();
    Logger.step(`Создание ${lobbiesCount} комнат`);

    async function createSingleRoom(roomNumber) {
        try {
            const result = await roomApi.createRoom();
            
            if (!result.success) {
                Logger.roomError(roomNumber - 1, `Ошибка создания: статус ${result.status}`);
                return { success: false, roomNumber };
            }
            
            return { 
                success: true, 
                roomNumber, 
                roomId: result.roomId 
            };
        } catch (error) {
            Logger.roomError(roomNumber - 1, `Ошибка создания: ${error.message}`);
            return { success: false, roomNumber, error: error.message };
        }
    }
    
    const promises = [];
    for (let i = 1; i <= lobbiesCount; i++) {
        promises.push(createSingleRoom(i));
    }
    
    const createdRooms = await Promise.all(promises);
    const roomIds = createdRooms.filter(r => r.success).map(r => r.roomId);
    
    const duration = (Date.now() - stepStart) / 1000;
    timingStats.recordStep('roomCreation', duration);
    
    Logger.progress(roomIds.length, lobbiesCount);
    Logger.time('Время создания', duration);
    
    return { roomIds, createdCount: roomIds.length, allResults: createdRooms };
}

module.exports = createRooms;