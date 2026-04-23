const Logger = require('../utils/logger');
const { waitForEvents } = require('../utils/helpers');

async function waitBotFill(results, socketEvents, timingStats) {
    const stepStart = Date.now();
    Logger.step('Ожидание заполнения комнаты ботом');
    
    const successfulRooms = results.filter(r => r.success);
    const eventsBefore = socketEvents.length;
    
    Logger.info('Ожидание ROOM_STARTED...');
    
    const waitResult = await waitForEvents(socketEvents, 'ROOM_STARTED', {
        timeout: 70000,
        interval: 2000,
        minCount: successfulRooms.length,
        filter: (e) => successfulRooms.some(r => r.roomId === e.roomId)
    });
    
    const roomStartedEvents = socketEvents.filter(e => e.type === 'ROOM_STARTED');
    const uniqueRoomsStarted = new Set(roomStartedEvents.map(e => e.roomId)).size;
    
    const duration = (Date.now() - stepStart) / 1000;
    timingStats.recordStep('botFill', duration);
    
    Logger.progress(uniqueRoomsStarted, successfulRooms.length, 'комнат с ROOM_STARTED');
    
    return { 
        roomStartedCount: uniqueRoomsStarted, 
        total: successfulRooms.length,
        events: roomStartedEvents 
    };
}

module.exports = waitBotFill;