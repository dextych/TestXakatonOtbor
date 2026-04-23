const SockJS = require('sockjs-client');
const Stomp = require('stompjs');
const EventEmitter = require('events');

class GameWebSocketClient extends EventEmitter {
    constructor(baseUrl) {
        super();
        this.baseUrl = baseUrl;
        this.client = null;
        this.connected = false;
        this.subscriptions = new Map();
    }

    connect(userToken) {
        return new Promise((resolve, reject) => {
            const socket = new SockJS(`${this.baseUrl}/ws/game`);
            this.client = Stomp.over(socket);
            this.client.debug = null;

            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, 15000);

            this.client.connect(
                { Authorization: `Bearer ${userToken}` },
                () => {
                    clearTimeout(timeout);
                    this.connected = true;
                    this.emit('connected');
                    resolve(this);
                },
                (error) => {
                    clearTimeout(timeout);
                    this.emit('error', error);
                    reject(error);
                }
            );
        });
    }

    subscribe(destination, callback) {
        if (!this.connected) {
            throw new Error('WebSocket not connected');
        }
        
        const subscription = this.client.subscribe(destination, (msg) => {
            try {
                const data = JSON.parse(msg.body);
                callback(data, msg);
                this.emit('message', { destination, data, raw: msg });
            } catch (e) {
                // Ignore parse errors
            }
        });
        
        this.subscriptions.set(destination, subscription);
        return subscription;
    }

    unsubscribe(destination) {
        const subscription = this.subscriptions.get(destination);
        if (subscription) {
            subscription.unsubscribe();
            this.subscriptions.delete(destination);
        }
    }

    unsubscribeAll() {
        this.subscriptions.forEach((subscription, destination) => {
            try {
                subscription.unsubscribe();
            } catch (e) {
                // Ignore
            }
        });
        this.subscriptions.clear();
    }

    disconnect() {
        return new Promise((resolve) => {
            if (this.client && this.connected) {
                this.client.disconnect(() => {
                    this.connected = false;
                    this.emit('disconnected');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    isConnected() {
        return this.connected;
    }
}

module.exports = GameWebSocketClient;