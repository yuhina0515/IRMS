// components/SessionControl.js
import { EventBus } from '../core/EventBus.js';
import { StateManager } from '../core/StateManager.js';
import { SessionApi } from '../services/SessionApi.js';

class SessionControlComponent {
    constructor() {
        this.btnConnect = document.getElementById('connect-btn');
        this.btnStartSession = document.getElementById('start-session-btn');
        this.btnEndSession = document.getElementById('end-session-btn');
        this.statusText = document.getElementById('status-text');
        this.statusIndicator = document.getElementById('status-indicator');

        this.inputTarget = document.getElementById('input-target');
        this.inputTolerance = document.getElementById('input-tolerance');
        this.inputHold = document.getElementById('input-hold');

        this.bindEvents();
        
        EventBus.on('BLE_CONNECTED', this.updateUIConnected.bind(this));
        EventBus.on('BLE_DISCONNECTED', this.updateUIDisconnected.bind(this));
        EventBus.on('BLE_STATUS_UPDATE', (msg) => { if (this.statusText) this.statusText.innerText = msg; });
        
        EventBus.on('TRIGGER_HOLD_PROGRESS', this.updateProgressRing.bind(this));
        EventBus.on('TRIGGER_REP_COMPLETED', this.onRepCompleted.bind(this));
        EventBus.on('TRIGGER_ZONE_ENTER', this.onZoneEnter.bind(this));
        EventBus.on('TRIGGER_ZONE_EXIT', this.onZoneExit.bind(this));
        EventBus.on('TRIGGER_REST_COMPLETED', this.onRestCompleted.bind(this));

        // Listen for new BLE data to buffer it if session is active
        EventBus.on('BLE_DATA_RECEIVED', this.bufferDataIfActive.bind(this));
    }

    bindEvents() {
        if (this.btnConnect) {
            this.btnConnect.addEventListener('click', () => {
                if (StateManager.get('isConnected')) {
                    EventBus.emit('BLE_DISCONNECT_REQUEST');
                } else {
                    EventBus.emit('BLE_CONNECT_REQUEST');
                }
            });
        }

        if (this.btnStartSession) {
            this.btnStartSession.addEventListener('click', this.startSession.bind(this));
        }

        if (this.btnEndSession) {
            this.btnEndSession.addEventListener('click', this.endSession.bind(this));
        }
    }

    updateUIConnected() {
        if (this.statusText) this.statusText.innerText = 'Connected to ' + StateManager.get('deviceName');
        if (this.statusIndicator) this.statusIndicator.classList.add('connected');
        if (this.btnConnect) {
            this.btnConnect.innerText = 'Disconnect';
            this.btnConnect.classList.replace('primary-btn', 'danger-btn');
        }
        
        const protocol = StateManager.get('cfgProtocol');
        const customActions = StateManager.get('customActions');
        const filteredActions = customActions.filter(a => a.protocol === protocol);
        
        if (this.btnStartSession) this.btnStartSession.disabled = filteredActions.length === 0;
        
        const btnSync = document.getElementById('sync-settings-btn');
        if (btnSync) btnSync.disabled = false;
    }

    updateUIDisconnected() {
        if (this.statusText) this.statusText.innerText = 'Disconnected';
        if (this.statusIndicator) this.statusIndicator.classList.remove('connected');
        if (this.btnConnect) {
            this.btnConnect.innerText = 'Connect Device';
            this.btnConnect.classList.replace('danger-btn', 'primary-btn');
        }
        if (this.btnStartSession) this.btnStartSession.disabled = true;
        
        const btnSync = document.getElementById('sync-settings-btn');
        if (btnSync) btnSync.disabled = true;
    }

    async startSession() {
        try {
            const target = parseFloat(this.inputTarget?.value) || 90;
            const tolerance = parseFloat(this.inputTolerance?.value) || 10;
            const holdTime = parseInt(this.inputHold?.value, 10) || 3000;
            const action = StateManager.get('cfgAction');
            const protocol = StateManager.get('cfgProtocol');
            
            const data = await SessionApi.start({
                targetAngle: target,
                tolerance: tolerance,
                holdTimeMs: holdTime,
                action: action,
                protocol: protocol
            });
            
            StateManager.set('currentSessionId', data.sessionId);
            
            if (this.btnStartSession) this.btnStartSession.style.display = 'none';
            if (this.btnEndSession) this.btnEndSession.style.display = 'inline-block';
            
            StateManager.set('repsCount', 0);
            const elReps = document.getElementById('reps-completed');
            if (elReps) elReps.innerText = '0';
            
            this.updateProgressRing(0);
            StateManager.set('dataBuffer', []);
            
            this.startBufferTimer();
            this.startSessionTimer();
            
            EventBus.emit('LOG_DEBUG', `Started rehabilitation session #${data.sessionId} with action "${action}"`);
            EventBus.emit('SESSION_STARTED');
        } catch (e) {
            EventBus.emit('LOG_DEBUG', `Error starting session: ${e}`);
        }
    }

    async endSession() {
        const sessionId = StateManager.get('currentSessionId');
        if (!sessionId) return;
        
        try {
            this.stopBufferTimer();
            this.stopSessionTimer();
            await this.flushDataBuffer();
            
            const reps = StateManager.get('repsCount');
            await SessionApi.end(sessionId, reps);
            
            EventBus.emit('LOG_DEBUG', `Ended rehabilitation session #${sessionId}. Total reps completed: ${reps}`);
            StateManager.set('currentSessionId', null);
            
            if (this.btnEndSession) this.btnEndSession.style.display = 'none';
            if (this.btnStartSession) this.btnStartSession.style.display = 'inline-block';
            this.updateProgressRing(0);
            
            EventBus.emit('CMD_SEND_BLE', 'CMD:LED_OFF');
            EventBus.emit('CMD_SEND_BLE', 'CMD:ALARM_OFF');
            StateManager.set('lastSentLedState', 'off');
            StateManager.set('lastSentAlarmState', 'off');
            
            EventBus.emit('SESSION_ENDED');
            EventBus.emit('LOAD_HISTORY_VIEW');
        } catch (e) {
            EventBus.emit('LOG_DEBUG', `Error ending session: ${e}`);
        }
    }

    // --- Progress & Trigger Responders ---

    onZoneEnter() {
        const arc = document.getElementById('current-target-arc-highlight');
        if(arc) {
            arc.style.display = 'block';
            if (window._currentTargetArcD) arc.setAttribute('d', window._currentTargetArcD);
        }
        if (StateManager.get('lastSentLedState') !== 'on') {
            EventBus.emit('CMD_SEND_BLE', 'CMD:LED_ON');
            StateManager.set('lastSentLedState', 'on');
        }
    }

    onZoneExit() {
        const arc = document.getElementById('current-target-arc-highlight');
        if (arc) arc.style.display = 'none';
        if (StateManager.get('lastSentLedState') !== 'off') {
            EventBus.emit('CMD_SEND_BLE', 'CMD:LED_OFF');
            StateManager.set('lastSentLedState', 'off');
        }
    }

    onRepCompleted() {
        let reps = StateManager.get('repsCount') + 1;
        StateManager.set('repsCount', reps);
        
        const repsEl = document.getElementById('session-reps-count');
        const dashRepsEl = document.getElementById('reps-completed');
        if (repsEl) repsEl.textContent = reps;
        if (dashRepsEl) dashRepsEl.textContent = reps;
        
        const arc = document.getElementById('current-target-arc-highlight');
        if (arc) arc.style.display = 'none';
        this.updateProgressRing(100);
        
        EventBus.emit('CMD_SEND_BLE', 'CMD:GOAL');
        
        const ring = document.getElementById('progress-ring-circle');
        if (ring) {
            ring.style.filter = 'drop-shadow(0 0 8px #10b981)';
            setTimeout(() => { ring.style.filter = 'none'; }, 800);
        }
    }

    onRestCompleted() {
        EventBus.emit('LOG_DEBUG', "Returned to rest position. Ready for next repetition.");
        this.updateProgressRing(0);
    }

    updateProgressRing(percent) {
        const circle = document.getElementById('progress-ring-circle');
        if (!circle) return;
        const radius = circle.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
        
        const pctEl = document.getElementById('progress-percent');
        if (pctEl) pctEl.innerText = `${Math.round(percent)}%`;
        
        if (percent >= 100) {
            circle.style.stroke = '#10b981'; // Green
        } else if (percent > 0) {
            circle.style.stroke = '#3b82f6'; // Blue
        } else {
            circle.style.stroke = 'rgba(255, 255, 255, 0.2)'; // Gray
        }
    }

    // --- Session Timers & Buffers ---

    startSessionTimer() {
        StateManager.set('sessionStartTimestamp', Date.now());
        const timerEl = document.getElementById('session-timer');
        const barEl = document.getElementById('session-bar');
        const actionNameEl = document.getElementById('session-action-name');
        const repsEl = document.getElementById('session-reps-count');
        
        if (barEl) barEl.classList.add('active');
        
        const activeActionId = StateManager.get('selectedActionId');
        const customActions = StateManager.get('customActions');
        const activeAction = customActions.find(a => a.id == activeActionId);
        
        if (actionNameEl) actionNameEl.textContent = activeAction ? activeAction.name : 'Custom';
        
        const interval = setInterval(() => {
            const start = StateManager.get('sessionStartTimestamp');
            if (!start) return;
            const elapsed = Math.floor((Date.now() - start) / 1000);
            const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
            const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
            const s = String(elapsed % 60).padStart(2, '0');
            if (timerEl) timerEl.textContent = `${h}:${m}:${s}`;
            if (repsEl) repsEl.textContent = StateManager.get('repsCount');
        }, 1000);
        
        StateManager.set('sessionTimerInterval', interval);
    }

    stopSessionTimer() {
        const interval = StateManager.get('sessionTimerInterval');
        if (interval) {
            clearInterval(interval);
            StateManager.set('sessionTimerInterval', null);
        }
        const barEl = document.getElementById('session-bar');
        if (barEl) barEl.classList.remove('active');
        StateManager.set('sessionStartTimestamp', null);
    }

    startBufferTimer() {
        this.stopBufferTimer();
        const interval = StateManager.get('cfgFlushInterval') * 1000;
        const timer = setInterval(() => this.flushDataBuffer(), interval);
        StateManager.set('bufferTimer', timer);
    }

    stopBufferTimer() {
        const timer = StateManager.get('bufferTimer');
        if (timer) {
            clearInterval(timer);
            StateManager.set('bufferTimer', null);
        }
    }

    bufferDataIfActive(angles) {
        const sessionId = StateManager.get('currentSessionId');
        if (sessionId) {
            const buf = StateManager.get('dataBuffer');
            buf.push({
                kneeAngle: angles.knee,
                thighAngle: angles.thigh,
                shinAngle: angles.shin,
                kneeRoll: angles.kneeRoll,
                thighRoll: angles.thighRoll,
                shinRoll: angles.shinRoll,
                timestamp: new Date().toISOString()
            });
        }
    }

    async flushDataBuffer() {
        const sessionId = StateManager.get('currentSessionId');
        const buffer = StateManager.get('dataBuffer');
        if (!sessionId || buffer.length === 0) return;
        
        const readings = [...buffer];
        StateManager.set('dataBuffer', []); // Clear local
        
        try {
            await SessionApi.flushBatchData(sessionId, readings);
        } catch (e) {
            // Restore on failure
            const currentBuf = StateManager.get('dataBuffer');
            const combined = readings.concat(currentBuf);
            // limit to 2000
            if (combined.length > 2000) {
                StateManager.set('dataBuffer', combined.slice(combined.length - 2000));
            } else {
                StateManager.set('dataBuffer', combined);
            }
            EventBus.emit('LOG_DEBUG', 'Batch upload failed, buffer restored.');
        }
    }
}

export const SessionControl = new SessionControlComponent();
