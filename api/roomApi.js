const ApiClient = require('./apiClient');
const config = require('../config/testConfig');

class RoomApi {
    constructor() {
        this.client = new ApiClient(config.GAME_URL);
    }

    async createRoom(adminToken = config.ADMIN_TOKEN) {
        const { response, data } = await this.client.post('/api/v1/game/rooms', {
            token: adminToken,
            body: config.ROOM_CONFIG
        });
        
        const roomId = data.room?.id || data.id;
        return { 
            success: response.status === 201, 
            status: response.status, 
            data, 
            roomId 
        };
    }

    async joinRoom(roomId, userToken) {
        const { response, data } = await this.client.post(`/api/v1/game/rooms/${roomId}/join`, {
            token: userToken
        });
        
        const participantId = data.participantId;
        return { 
            success: response.status === 200 || response.status === 204,
            status: response.status, 
            data, 
            participantId 
        };
    }

    async getRoom(roomId, token = config.ADMIN_TOKEN) {
        const { response, data } = await this.client.get(`/api/v1/game/rooms/${roomId}`, {
            token
        });
        
        return { success: response.ok, status: response.status, data };
    }

    async deleteRoom(roomId, token = config.ADMIN_TOKEN) {
        const { response, data } = await this.client.delete(`/api/v1/game/rooms/${roomId}`, {
            token
        });
        
        return { success: response.ok, status: response.status, data };
    }
}

module.exports = new RoomApi();