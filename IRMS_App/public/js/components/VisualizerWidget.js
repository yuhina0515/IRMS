// components/VisualizerWidget.js
import { EventBus } from '../core/EventBus.js';
import { StateManager } from '../core/StateManager.js';

class VisualizerWidgetComponent {
    constructor() {
        this.elThighAngle = document.getElementById('thigh-angle');
        this.elShinAngle = document.getElementById('shin-angle');
        this.elCurrentAngle = document.getElementById('current-angle');
        this.elCurrentRoll = document.getElementById('current-roll');
        
        this.thighBone = document.getElementById('thigh-bone');
        this.shinBone = document.getElementById('shin-bone');
        this.targetArc = document.getElementById('target-arc');

        EventBus.on('BLE_DATA_RECEIVED', this.updateVisualizer.bind(this));
        EventBus.on('BLE_DISCONNECTED', this.clearVisualizer.bind(this));
    }

    polarToCartesian(centerX, centerY, radius, angleInDegrees) {
        const angleInRadians = (90 - angleInDegrees) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    }

    describeArc(x, y, radius, startAngle, endAngle) {
        const start = this.polarToCartesian(x, y, radius, endAngle);
        const end = this.polarToCartesian(x, y, radius, startAngle);
        const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? "0" : "1";
        return [
            "M", start.x, start.y,
            "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
        ].join(" ");
    }

    updateVisualizer(angles) {
        const { knee, thigh, shin, kneeRoll } = angles;

        // Update UI Texts
        if (this.elThighAngle) this.elThighAngle.innerHTML = `${thigh.toFixed(1)}&deg;`;
        if (this.elShinAngle) this.elShinAngle.innerHTML = `${shin.toFixed(1)}&deg;`;
        if (this.elCurrentAngle) this.elCurrentAngle.innerHTML = `${knee.toFixed(1)}&deg;`;
        if (this.elCurrentRoll) this.elCurrentRoll.innerHTML = `${kneeRoll.toFixed(1)}&deg;`;

        // Update SVG Bones
        if (!this.thighBone || !this.shinBone) return;

        const thighRad = thigh * Math.PI / 180;
        const shinRad = shin * Math.PI / 180;
        
        const thighX = 100 + 60 * Math.sin(thighRad);
        const thighY = 100 - 60 * Math.cos(thighRad);
        const shinX = 100 + 60 * Math.sin(shinRad);
        const shinY = 100 + 60 * Math.cos(shinRad);
        
        this.thighBone.setAttribute('x2', thighX.toFixed(1));
        this.thighBone.setAttribute('y2', thighY.toFixed(1));
        this.shinBone.setAttribute('x2', shinX.toFixed(1));
        this.shinBone.setAttribute('y2', shinY.toFixed(1));

        // Draw Target Arc
        const activeActionId = StateManager.get('selectedActionId');
        const customActions = StateManager.get('customActions');
        const activeAction = customActions.find(a => a.id == activeActionId);
        const triggerType = activeAction ? activeAction.triggerType : 'joint_angle';

        const targetAngleVal = parseFloat(document.getElementById('input-target')?.value) || 90;
        const toleranceVal = parseFloat(document.getElementById('input-tolerance')?.value) || 10;

        let startArcAngle = 0;
        let endArcAngle = 0;
        let targetArcRadius = 48;
        
        if (triggerType === 'segment_elevation') {
            startArcAngle = 180 - targetAngleVal - toleranceVal;
            endArcAngle = 180 - targetAngleVal + toleranceVal;
            targetArcRadius = 52;
        } else if (triggerType === 'segment_extension') {
            startArcAngle = 180 + targetAngleVal - toleranceVal;
            endArcAngle = 180 + targetAngleVal + toleranceVal;
            targetArcRadius = 52;
        } else {
            startArcAngle = thigh - targetAngleVal - toleranceVal;
            endArcAngle = thigh - targetAngleVal + toleranceVal;
            targetArcRadius = 48;
        }
        
        const targetArcD = this.describeArc(100, 100, targetArcRadius, startArcAngle, endArcAngle);
        if (this.targetArc) {
            this.targetArc.setAttribute('d', targetArcD);
            const isSegmentBase = (triggerType === 'segment_elevation' || triggerType === 'segment_extension');
            this.targetArc.setAttribute('stroke-width', isSegmentBase ? "8" : "14");
        }

        // Cache for TriggerEngine highlight
        window._currentTargetArcD = targetArcD;
    }

    clearVisualizer() {
        if (this.elThighAngle) this.elThighAngle.innerHTML = '--&deg;';
        if (this.elShinAngle) this.elShinAngle.innerHTML = '--&deg;';
        if (this.elCurrentAngle) this.elCurrentAngle.innerHTML = '--&deg;';
    }
}

export const VisualizerWidget = new VisualizerWidgetComponent();
