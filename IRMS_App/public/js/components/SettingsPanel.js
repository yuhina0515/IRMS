// components/SettingsPanel.js
import { EventBus } from '../core/EventBus.js';
import { StateManager } from '../core/StateManager.js';

class SettingsPanelComponent {
    constructor() {
        this.bindDOM();
        this.loadSettingsToUI();
        this.attachListeners();

        EventBus.on('BLE_CONNECTED', () => { if (this.btnSyncSettings) this.btnSyncSettings.disabled = false; });
        EventBus.on('BLE_DISCONNECTED', () => { if (this.btnSyncSettings) this.btnSyncSettings.disabled = true; });
    }

    bindDOM() {
        // Calibration
        this.inputThighOffset = document.getElementById('settings-thigh-offset');
        this.inputThighInvert = document.getElementById('settings-thigh-invert');
        this.inputShinOffset = document.getElementById('settings-shin-offset');
        this.inputShinInvert = document.getElementById('settings-shin-invert');
        
        this.inputThighRollOffset = document.getElementById('settings-thigh-roll-offset');
        this.inputThighRollInvert = document.getElementById('settings-thigh-roll-invert');
        this.inputShinRollOffset = document.getElementById('settings-shin-roll-offset');
        this.inputShinRollInvert = document.getElementById('settings-shin-roll-invert');

        // Session
        this.inputTarget = document.getElementById('input-target');
        this.inputTolerance = document.getElementById('input-tolerance');
        this.inputHold = document.getElementById('input-hold');

        // General UI Settings
        this.inputProtocol = document.getElementById('settings-protocol');
        this.inputMaxChart = document.getElementById('settings-chart-points');
        this.inputFlushInterval = document.getElementById('settings-flush-interval');

        this.btnSyncSettings = document.getElementById('sync-settings-btn');
    }

    loadSettingsToUI() {
        if (this.inputThighOffset) this.inputThighOffset.value = StateManager.get('cfgThighOffset');
        if (this.inputThighInvert) this.inputThighInvert.checked = StateManager.get('cfgThighInvert');
        if (this.inputShinOffset) this.inputShinOffset.value = StateManager.get('cfgShinOffset');
        if (this.inputShinInvert) this.inputShinInvert.checked = StateManager.get('cfgShinInvert');
        
        if (this.inputThighRollOffset) this.inputThighRollOffset.value = StateManager.get('cfgThighRollOffset');
        if (this.inputThighRollInvert) this.inputThighRollInvert.checked = StateManager.get('cfgThighRollInvert');
        if (this.inputShinRollOffset) this.inputShinRollOffset.value = StateManager.get('cfgShinRollOffset');
        if (this.inputShinRollInvert) this.inputShinRollInvert.checked = StateManager.get('cfgShinRollInvert');
        
        if (this.inputProtocol) this.inputProtocol.value = StateManager.get('cfgProtocol');
        if (this.inputMaxChart) this.inputMaxChart.value = StateManager.get('cfgMaxChartPoints');
        if (this.inputFlushInterval) this.inputFlushInterval.value = StateManager.get('cfgFlushInterval');
    }

    debounce(fn, ms) {
        let timer;
        return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    }

    saveConfig() {
        if (this.inputThighOffset) StateManager.set('cfgThighOffset', parseFloat(this.inputThighOffset.value) || 0.0);
        if (this.inputThighInvert) StateManager.set('cfgThighInvert', this.inputThighInvert.checked);
        if (this.inputShinOffset) StateManager.set('cfgShinOffset', parseFloat(this.inputShinOffset.value) || 0.0);
        if (this.inputShinInvert) StateManager.set('cfgShinInvert', this.inputShinInvert.checked);
        
        if (this.inputThighRollOffset) StateManager.set('cfgThighRollOffset', parseFloat(this.inputThighRollOffset.value) || 0.0);
        if (this.inputThighRollInvert) StateManager.set('cfgThighRollInvert', this.inputThighRollInvert.checked);
        if (this.inputShinRollOffset) StateManager.set('cfgShinRollOffset', parseFloat(this.inputShinRollOffset.value) || 0.0);
        if (this.inputShinRollInvert) StateManager.set('cfgShinRollInvert', this.inputShinRollInvert.checked);
        
        if (this.inputProtocol) StateManager.set('cfgProtocol', this.inputProtocol.value);
        if (this.inputMaxChart) StateManager.set('cfgMaxChartPoints', parseInt(this.inputMaxChart.value, 10) || 50);
        if (this.inputFlushInterval) StateManager.set('cfgFlushInterval', parseInt(this.inputFlushInterval.value, 10) || 2);
        
        StateManager.saveConfigToStorage();
    }

    attachListeners() {
        const debouncedSave = this.debounce(this.saveConfig.bind(this), 300);

        [
            this.inputThighOffset, this.inputThighInvert,
            this.inputShinOffset, this.inputShinInvert,
            this.inputThighRollOffset, this.inputThighRollInvert,
            this.inputShinRollOffset, this.inputShinRollInvert,
            this.inputMaxChart, this.inputFlushInterval
        ].forEach(el => {
            if (el) {
                el.addEventListener('change', debouncedSave);
                if (el.type === 'number') {
                    el.addEventListener('input', debouncedSave);
                }
            }
        });

        if (this.inputProtocol) {
            this.inputProtocol.addEventListener('change', () => {
                this.saveConfig();
                EventBus.emit('PROTOCOL_CHANGED', this.inputProtocol.value);
            });
        }

        if (this.btnSyncSettings) {
            this.btnSyncSettings.addEventListener('click', () => {
                // Not strictly needed since math is mostly done on client now, but sends offset if firmware needs it
                const ts = StateManager.get('cfgThighOffset').toFixed(1);
                const ss = StateManager.get('cfgShinOffset').toFixed(1);
                const cmdStr = `CMD:SYNC,${ts},${ss}`;
                EventBus.emit('CMD_SEND_BLE', cmdStr);
                EventBus.emit('UI_SHOW_TOAST', { message: 'Settings synced to hardware.', type: 'success' });
            });
        }

        const btnQuickCalibrate = document.getElementById('btn-quick-calibrate');
        if (btnQuickCalibrate) {
            btnQuickCalibrate.addEventListener('click', () => {
                this.applyZeroCalibration('thigh');
                this.applyZeroCalibration('shin');
            });
        }
    }

    applyZeroCalibration(segment) {
        if (segment === 'thigh') {
            const raw = StateManager.get('rawLastThigh');
            const invert = StateManager.get('cfgThighInvert');
            const newOffset = (raw * (invert ? -1 : 1)) * -1;
            if (this.inputThighOffset) {
                this.inputThighOffset.value = newOffset.toFixed(1);
                this.saveConfig();
            }
        } else if (segment === 'shin') {
            const raw = StateManager.get('rawLastShin');
            const invert = StateManager.get('cfgShinInvert');
            const newOffset = (raw * (invert ? -1 : 1)) * -1;
            if (this.inputShinOffset) {
                this.inputShinOffset.value = newOffset.toFixed(1);
                this.saveConfig();
            }
        }
        EventBus.emit('UI_SHOW_TOAST', { message: 'Quick Zero Calibration applied!', type: 'success' });
    }
}

export const SettingsPanel = new SettingsPanelComponent();
