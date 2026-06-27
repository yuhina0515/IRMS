// core/EventBus.js
/**
 * EventBus - Centralized Publish/Subscribe system
 * Decouples plugins by allowing them to emit and listen to events
 * instead of calling each other directly.
 */
class EventBusClass {
    constructor() {
        this.listeners = {};
    }

    /**
     * Subscribe to an event
     * @param {string} eventName 
     * @param {function} callback 
     * @returns {function} unsubscribe function
     */
    on(eventName, callback) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(callback);

        // Return unsubscribe function
        return () => {
            this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
        };
    }

    /**
     * Emit an event to all subscribers
     * @param {string} eventName 
     * @param {any} payload 
     */
    emit(eventName, payload) {
        if (!this.listeners[eventName]) return;
        this.listeners[eventName].forEach(callback => {
            try {
                callback(payload);
            } catch (err) {
                console.error(`[EventBus] Error in listener for event ${eventName}:`, err);
            }
        });
    }

    /**
     * Remove a specific listener
     * @param {string} eventName 
     * @param {function} callback 
     */
    off(eventName, callback) {
        if (!this.listeners[eventName]) return;
        this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
    }
}

export const EventBus = new EventBusClass();
