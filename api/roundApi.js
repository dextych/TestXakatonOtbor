const ApiClient = require('./apiClient');
const config = require('../config/testConfig');

class RoundApi {
    constructor() {
        this.client = new ApiClient(config.GAME_URL);
    }

    async getBarrels(roomId, roundNumber, userToken) {
        const { response, data } = await this.client.get(
            `/api/v1/game/rooms/${roomId}/rounds/${roundNumber}/barrels`,
            { token: userToken }
        );
        
        return { 
            success: response.ok, 
            status: response.status, 
            data 
        };
    }

    async selectBarrels(roomId, roundNumber, barrelIds, userToken) {
        const { response, data } = await this.client.post(
            `/api/v1/game/rooms/${roomId}/rounds/${roundNumber}/selection`,
            {
                token: userToken,
                body: { barrelIds }
            }
        );
        
        return { 
            success: response.ok, 
            status: response.status, 
            data 
        };
    }

    async buyBoost(roomId, roundNumber, userToken) {
        const { response, data } = await this.client.post(
            `/api/v1/game/rooms/${roomId}/rounds/${roundNumber}/boost`,
            { token: userToken }
        );
        
        return { 
            success: response.ok, 
            status: response.status, 
            data 
        };
    }

    async getRoundResult(roomId, roundNumber, token = config.ADMIN_TOKEN) {
        const { response, data } = await this.client.get(
            `/api/v1/game/rooms/${roomId}/rounds/${roundNumber}/result`,
            { token }
        );
        
        return { 
            success: response.ok, 
            status: response.status, 
            data 
        };
    }
}

module.exports = new RoundApi();