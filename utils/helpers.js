function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCondition(conditionFn, options = {}) {
    const {
        timeout = 30000,
        interval = 1000,
        message = 'Waiting for condition'
    } = options;

    const startTime = Date.now();
    
    while ((Date.now() - startTime) < timeout) {
        const result = await conditionFn();
        if (result) {
            return { success: true, elapsed: (Date.now() - startTime) / 1000 };
        }
        await sleep(interval);
    }
    
    return { success: false, elapsed: timeout / 1000 };
}

async function waitForEvents(eventArray, eventType, options = {}) {
    const {
        timeout = 30000,
        interval = 1000,
        minCount = 1,
        filter = () => true
    } = options;

    const startTime = Date.now();
    const eventsBefore = eventArray.length;
    
    while ((Date.now() - startTime) < timeout) {
        const newEvents = eventArray.slice(eventsBefore);
        const matchingEvents = newEvents.filter(e => e.type === eventType && filter(e));
        
        if (matchingEvents.length >= minCount) {
            return {
                success: true,
                events: matchingEvents,
                elapsed: (Date.now() - startTime) / 1000
            };
        }
        await sleep(interval);
    }
    
    return {
        success: false,
        events: [],
        elapsed: timeout / 1000
    };
}

module.exports = { sleep, waitForCondition, waitForEvents };