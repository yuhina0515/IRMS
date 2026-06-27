// services/TriggerEngine.js
import { EventBus } from '../core/EventBus.js';

class TriggerEngineClass {
    constructor() {
        this.state = 'IDLE'; // States: IDLE, HOLDING, REST_PENDING
        this.inZoneStartTime = 0;
        
        // Listen to Bluetooth angle updates
        EventBus.on('BLE_ANGLES_UPDATED', this.handleAnglesUpdated.bind(this));
    }

    handleAnglesUpdated({ angles, config }) {
        const { knee, thigh, shin } = angles;
        const { targetAngle, tolerance, holdTimeMs, triggerType } = config;

        // 1. Check Rest Condition
        const isAtRest = this.checkRestCondition(knee, thigh, shin, triggerType);

        if (this.state === 'REST_PENDING') {
            if (isAtRest) {
                this.state = 'IDLE';
                EventBus.emit('TRIGGER_REST_COMPLETED');
            }
            return;
        }

        // 2. Check Target Condition
        const inZone = this.checkActionCondition(knee, thigh, shin, targetAngle, tolerance, triggerType);

        if (this.state === 'IDLE' && inZone) {
            this.state = 'HOLDING';
            this.inZoneStartTime = Date.now();
            EventBus.emit('TRIGGER_ZONE_ENTER');
        }

        if (this.state === 'HOLDING') {
            if (inZone) {
                const elapsed = Date.now() - this.inZoneStartTime;
                const percent = Math.min(100, (elapsed / holdTimeMs) * 100);
                
                EventBus.emit('TRIGGER_HOLD_PROGRESS', percent);

                if (percent >= 100) {
                    this.state = 'REST_PENDING';
                    EventBus.emit('TRIGGER_REP_COMPLETED');
                }
            } else {
                this.state = 'IDLE';
                this.inZoneStartTime = 0;
                EventBus.emit('TRIGGER_HOLD_PROGRESS', 0);
                EventBus.emit('TRIGGER_ZONE_EXIT');
            }
        }
    }

    checkActionCondition(knee, thigh, shin, targetAngleVal, toleranceVal, triggerType) {
        if (!triggerType) return Math.abs(knee - targetAngleVal) <= toleranceVal;
        
        if (triggerType === 'segment_elevation') {
            return (knee <= Math.max(15, toleranceVal)) && (thigh >= targetAngleVal);
        } else if (triggerType === 'segment_extension') {
            return (knee <= Math.max(15, toleranceVal)) && (thigh <= -targetAngleVal);
        } else {
            return Math.abs(knee - targetAngleVal) <= toleranceVal;
        }
    }

    checkRestCondition(knee, thigh, shin, triggerType) {
        const restTolerance = 30; // Relaxed standard tolerance for rest position
        
        if (!triggerType) return knee <= restTolerance;
        
        if (triggerType === 'segment_elevation') {
            return thigh <= restTolerance;
        } else if (triggerType === 'segment_extension') {
            return thigh >= -restTolerance;
        }
        
        return knee <= restTolerance;
    }

    reset() {
        this.state = 'IDLE';
        this.inZoneStartTime = 0;
        EventBus.emit('TRIGGER_HOLD_PROGRESS', 0);
    }
}

export const TriggerEngine = new TriggerEngineClass();
