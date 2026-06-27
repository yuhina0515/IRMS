// js/main.js
// --- IRMS Frontend Entry Point ---

// 1. Core Engine
import { EventBus } from './core/EventBus.js';
import { StateManager } from './core/StateManager.js';

// 2. Services (Background tasks, logic)
import { BluetoothService } from './services/BluetoothService.js';
import { TriggerEngine } from './services/TriggerEngine.js';

// 3. Components (UI Plugins)
import { SystemLog } from './components/SystemLog.js';
import { Navigation } from './components/Navigation.js';
import { ChartWidget } from './components/ChartWidget.js';
import { VisualizerWidget } from './components/VisualizerWidget.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { SessionControl } from './components/SessionControl.js';
import { HistoryPanel } from './components/HistoryPanel.js';
import { CustomActionsPanel } from './components/CustomActionsPanel.js';

// 4. Modal Handlers (for Session History Playback, can be moved to HistoryPanel if desired)
import { SessionApi } from './services/SessionApi.js';

import { showToast, showConfirm } from './utils/uiUtils.js';

// Global error handler mapping to SystemLog
window.addEventListener('error', (event) => {
    EventBus.emit('LOG_DEBUG', `[Global Error] ${event.message} at ${event.filename}:${event.lineno}`);
});

// Register UI event listeners
EventBus.on('UI_SHOW_TOAST', (payload) => {
    showToast(payload.message, payload.type, payload.duration);
});

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    EventBus.emit('LOG_DEBUG', '[System] Initializing plugin architecture...');
    
    // Load initial data
    await StateManager.loadCustomActions();
    EventBus.emit('LOAD_HISTORY_VIEW');
    
    // Wire up TriggerEngine feedback loop to EventBus
    EventBus.on('BLE_DATA_RECEIVED', (angles) => {
        // Only evaluate if there's an active action and we are not disconnected
        if (!StateManager.get('isConnected')) return;
        
        const targetAngle = parseFloat(document.getElementById('input-target')?.value) || 90;
        const tolerance = parseFloat(document.getElementById('input-tolerance')?.value) || 10;
        const holdTimeMs = parseInt(document.getElementById('input-hold')?.value, 10) || 3000;
        
        const actions = StateManager.get('customActions');
        const activeAction = actions.find(a => a.id == StateManager.get('selectedActionId'));
        const triggerType = activeAction ? activeAction.triggerType : 'joint_angle';

        TriggerEngine.handleAnglesUpdated({
            angles,
            config: { targetAngle, tolerance, holdTimeMs, triggerType }
        });
    });

    // Session Modal playback logic (legacy from evaluator.js/ui.js, migrated here for simplicity)
    EventBus.on('OPEN_SESSION_MODAL', async (sessionId) => {
        try {
            const dataRes = await SessionApi.fetchSessionData(sessionId);
            const readings = dataRes;
            
            // Logic for modal rendering
            document.getElementById('modal-title').innerText = `Session #${sessionId} Analysis`;
            document.getElementById('session-modal').style.display = 'flex';
            
            const modalCtx = document.getElementById('modalChart')?.getContext('2d');
            if (modalCtx && window.modalChartInstance) {
                window.modalChartInstance.destroy();
            }
            if (modalCtx) {
                const labels = readings.map(r => new Date(r.timestamp).toLocaleTimeString([], { hour12: false }));
                const kneeData = readings.map(r => r.kneeAngle);
                
                window.modalChartInstance = new Chart(modalCtx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Knee Angle',
                            data: kneeData,
                            borderColor: '#3b82f6',
                            borderWidth: 2,
                            fill: true,
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            pointRadius: 0
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }
        } catch (e) {
            EventBus.emit('LOG_DEBUG', `Error opening session modal: ${e}`);
        }
    });

    EventBus.emit('LOG_DEBUG', '[System] Initialization complete.');
});
