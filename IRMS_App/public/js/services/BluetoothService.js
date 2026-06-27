// services/BluetoothService.js
import { EventBus } from '../core/EventBus.js';
import { StateManager } from '../core/StateManager.js';

const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHAR_UUID_ANGLE_TX = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CHAR_UUID_PROFILE_RX = "beb5483f-36e1-4688-b7f5-ea07361b26a8";

class BluetoothServiceClass {
    constructor() {
        this.device = null;
        this.angleCharacteristic = null;
        this.profileCharacteristic = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.manualDisconnect = false;

        // Listen for outgoing commands from other components
        EventBus.on('CMD_SEND_BLE', this.sendCommand.bind(this));
        EventBus.on('BLE_CONNECT_REQUEST', this.connect.bind(this));
        EventBus.on('BLE_DISCONNECT_REQUEST', this.disconnect.bind(this));
    }

    async connect() {
        this.manualDisconnect = false;
        if (StateManager.get('isConnected')) {
            this.disconnect();
            return;
        }

        try {
            EventBus.emit('LOG_DEBUG', 'Requesting Bluetooth Device...');
            
            this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [SERVICE_UUID]
            });

            EventBus.emit('LOG_DEBUG', `Device selected: ${this.device.name}`);
            this.device.addEventListener('gattserverdisconnected', this.onDisconnected.bind(this));

            await this.connectGATT();

        } catch (error) {
            if (error.name === 'NotFoundError' || (error.message && error.message.includes('User cancelled'))) {
                EventBus.emit('LOG_DEBUG', 'Connection cancelled by user.');
                return;
            }
            EventBus.emit('LOG_DEBUG', `Error during connection: ${error.message || error}`);
            EventBus.emit('UI_SHOW_TOAST', { message: 'Connection failed: ' + error, type: 'error' });
        }
    }

    async connectGATT() {
        EventBus.emit('LOG_DEBUG', 'Connecting to GATT Server...');
        EventBus.emit('BLE_STATUS_UPDATE', 'Connecting...');
        
        const server = await this.device.gatt.connect();
        
        EventBus.emit('LOG_DEBUG', 'Getting Service...');
        const service = await server.getPrimaryService(SERVICE_UUID);
        
        EventBus.emit('LOG_DEBUG', 'Retrieving Characteristic TX...');
        this.angleCharacteristic = await service.getCharacteristic(CHAR_UUID_ANGLE_TX);
        
        EventBus.emit('LOG_DEBUG', 'Starting notifications...');
        await this.angleCharacteristic.startNotifications();
        this.angleCharacteristic.addEventListener('characteristicvaluechanged', this.handleAngleNotification.bind(this));

        try {
            this.profileCharacteristic = await service.getCharacteristic(CHAR_UUID_PROFILE_RX);
        } catch(e) {
            EventBus.emit('LOG_DEBUG', `Characteristic RX not found (not critical)`);
        }

        StateManager.set('isConnected', true);
        StateManager.set('deviceName', this.device.name);
        this.reconnectAttempts = 0;
        
        EventBus.emit('BLE_CONNECTED');
        EventBus.emit('LOG_DEBUG', 'Successfully connected and subscribed!');
        EventBus.emit('UI_SHOW_TOAST', { message: 'Device connected successfully!', type: 'success' });
    }

    disconnect() {
        this.manualDisconnect = true;
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
    }

    onDisconnected() {
        EventBus.emit('LOG_DEBUG', 'Device disconnected (GATT connection lost).');
        StateManager.set('isConnected', false);
        StateManager.set('deviceName', null);
        
        // Reset command caches
        StateManager.set('lastSentLedState', null);
        StateManager.set('lastSentAlarmState', null);
        
        EventBus.emit('BLE_DISCONNECTED');

        if (!this.manualDisconnect) {
            this.attemptAutoReconnect();
        }
    }

    async attemptAutoReconnect() {
        this.reconnectAttempts = 0;
        while (this.reconnectAttempts < this.maxReconnectAttempts && !StateManager.get('isConnected') && !this.manualDisconnect) {
            this.reconnectAttempts++;
            EventBus.emit('LOG_DEBUG', `Auto-reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            EventBus.emit('BLE_STATUS_UPDATE', `Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            try {
                await this.connectGATT();
                return;
            } catch (err) {
                EventBus.emit('LOG_DEBUG', `Reconnect attempt ${this.reconnectAttempts} failed: ${err.message || err}`);
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
        }
        
        if (!StateManager.get('isConnected')) {
            EventBus.emit('UI_SHOW_TOAST', { message: 'Auto-reconnect failed. Please reconnect manually.', type: 'error' });
            EventBus.emit('LOG_DEBUG', 'Auto-reconnect exhausted all attempts.');
            EventBus.emit('BLE_STATUS_UPDATE', 'Disconnected');
        }
    }

    handleAngleNotification(event) {
        if (!event || !event.target || !event.target.value) return;

        const value = new TextDecoder().decode(event.target.value);
        
        if (value.startsWith("ERR:")) {
            EventBus.emit('LOG_DEBUG', `Received error notification: ${value}`);
            EventBus.emit('BLE_HARDWARE_ERROR', value);
            return;
        } else {
            EventBus.emit('BLE_HARDWARE_OK');
        }

        // Throttle debug logs
        const counter = StateManager.get('notificationCounter') + 1;
        StateManager.set('notificationCounter', counter);
        if (counter % 15 === 1) {
            EventBus.emit('LOG_DEBUG', `Received packet #${counter}: "${value}"`);
        }

        let angleThigh = 0, angleShin = 0, angleKnee = 0;
        let rollThigh = 0, rollShin = 0, rollKnee = 0;
        
        const parts = value.split(',');
        if (parts.length >= 3) {
            parts.forEach(p => {
                if (p.startsWith('T:')) angleThigh = parseFloat(p.substring(2));
                else if (p.startsWith('S:')) angleShin = parseFloat(p.substring(2));
                else if (p.startsWith('K:')) angleKnee = parseFloat(p.substring(2));
                else if (p.startsWith('TR:')) rollThigh = parseFloat(p.substring(3));
                else if (p.startsWith('SR:')) rollShin = parseFloat(p.substring(3));
                else if (p.startsWith('KR:')) rollKnee = parseFloat(p.substring(3));
            });
        } else {
            angleKnee = parseFloat(value);
        }

        if (isNaN(angleThigh) || isNaN(angleShin) || isNaN(angleKnee)) {
            EventBus.emit('LOG_DEBUG', `Warning: Malformed BLE packet discarded: "${value}"`);
            return;
        }

        // Apply Calibration Offsets/Inversions
        const correctedThigh = (angleThigh * (StateManager.get('cfgThighInvert') ? -1 : 1)) + StateManager.get('cfgThighOffset');
        const correctedShin = (angleShin * (StateManager.get('cfgShinInvert') ? -1 : 1)) + StateManager.get('cfgShinOffset');
        const correctedThighRoll = (rollThigh * (StateManager.get('cfgThighRollInvert') ? -1 : 1)) + StateManager.get('cfgThighRollOffset');
        const correctedShinRoll = (rollShin * (StateManager.get('cfgShinRollInvert') ? -1 : 1)) + StateManager.get('cfgShinRollOffset');
        
        const correctedKnee = Math.abs(correctedThigh - correctedShin);
        const correctedKneeRoll = Math.abs(correctedThighRoll - correctedShinRoll);

        const angles = {
            knee: correctedKnee,
            thigh: correctedThigh,
            shin: correctedShin,
            kneeRoll: correctedKneeRoll,
            thighRoll: correctedThighRoll,
            shinRoll: correctedShinRoll,
            rawThigh: angleThigh,
            rawShin: angleShin,
            rawThighRoll: rollThigh,
            rawShinRoll: rollShin
        };

        // Cache raw values to state manager for calibration UI
        StateManager.set('rawLastThigh', angleThigh);
        StateManager.set('rawLastShin', angleShin);
        StateManager.set('rawLastThighRoll', rollThigh);
        StateManager.set('rawLastShinRoll', rollShin);

        // Emit corrected angles for UI/Charts/TriggerEngine to consume
        EventBus.emit('BLE_DATA_RECEIVED', angles);
    }

    async sendCommand(commandStr) {
        if (!this.profileCharacteristic) return;
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(commandStr + '\n');
            await this.profileCharacteristic.writeValue(data);
        } catch (e) {
            EventBus.emit('LOG_DEBUG', `Failed to send command ${commandStr}: ${e}`);
        }
    }
}

export const BluetoothService = new BluetoothServiceClass();
