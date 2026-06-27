// core/StateManager.js
import { EventBus } from './EventBus.js';
import { ActionApi } from '../services/ActionApi.js';

class StateManagerClass {
    constructor() {
        this.state = {
            // BLE Status
            isConnected: false,
            deviceName: null,
            
            // Session
            currentSessionId: null,
            repsCount: 0,
            
            // Settings
            cfgThighInvert: localStorage.getItem('irms_thigh_invert') === 'true',
            cfgThighOffset: parseFloat(localStorage.getItem('irms_thigh_offset')) || 0.0,
            cfgShinInvert: localStorage.getItem('irms_shin_invert') === 'true',
            cfgShinOffset: parseFloat(localStorage.getItem('irms_shin_offset')) || 0.0,
            
            cfgThighRollInvert: localStorage.getItem('irms_thigh_roll_invert') === 'true',
            cfgThighRollOffset: parseFloat(localStorage.getItem('irms_thigh_roll_offset')) || 0.0,
            cfgShinRollInvert: localStorage.getItem('irms_shin_roll_invert') === 'true',
            cfgShinRollOffset: parseFloat(localStorage.getItem('irms_shin_roll_offset')) || 0.0,
            
            cfgProtocol: localStorage.getItem('irms_protocol') || 'knee',
            cfgAction: localStorage.getItem('irms_action') || '',
            cfgMaxChartPoints: parseInt(localStorage.getItem('irms_chart_points'), 10) || 50,
            cfgFlushInterval: parseInt(localStorage.getItem('irms_flush_interval'), 10) || 2,
            
            // Actions
            customActions: [],
            selectedActionId: null,
        };
    }

    get(key) {
        return this.state[key];
    }

    set(key, value) {
        if (this.state[key] !== value) {
            const oldValue = this.state[key];
            this.state[key] = value;
            EventBus.emit(`STATE_CHANGED:${key}`, { newValue: value, oldValue });
        }
    }

    saveConfigToStorage() {
        localStorage.setItem('irms_thigh_invert', this.state.cfgThighInvert);
        localStorage.setItem('irms_thigh_offset', this.state.cfgThighOffset);
        localStorage.setItem('irms_shin_invert', this.state.cfgShinInvert);
        localStorage.setItem('irms_shin_offset', this.state.cfgShinOffset);

        localStorage.setItem('irms_thigh_roll_invert', this.state.cfgThighRollInvert);
        localStorage.setItem('irms_thigh_roll_offset', this.state.cfgThighRollOffset);
        localStorage.setItem('irms_shin_roll_invert', this.state.cfgShinRollInvert);
        localStorage.setItem('irms_shin_roll_offset', this.state.cfgShinRollOffset);

        localStorage.setItem('irms_protocol', this.state.cfgProtocol);
        localStorage.setItem('irms_action', this.state.cfgAction);
        localStorage.setItem('irms_chart_points', this.state.cfgMaxChartPoints);
        localStorage.setItem('irms_flush_interval', this.state.cfgFlushInterval);
        
        EventBus.emit('CONFIG_SAVED');
    }

    async loadCustomActions() {
        try {
            const actions = await ActionApi.fetchAll();
            this.set('customActions', actions);
            EventBus.emit('CUSTOM_ACTIONS_LOADED', actions);
        } catch (e) {
            console.error('Failed to load custom actions', e);
        }
    }
}

export const StateManager = new StateManagerClass();
