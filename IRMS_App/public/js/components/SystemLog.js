// components/SystemLog.js
import { EventBus } from '../core/EventBus.js';

class SystemLogComponent {
    constructor() {
        this.logContainer = document.getElementById('debug-log');
        this.maxLines = 200;

        EventBus.on('LOG_DEBUG', this.logMessage.bind(this));
    }

    logMessage(msg) {
        console.log(msg);
        if (!this.logContainer) return;

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        this.logContainer.textContent += `\n[${timeStr}] ${msg}`;
        this.logContainer.scrollTop = this.logContainer.scrollHeight;

        const lines = this.logContainer.textContent.split('\n');
        if (lines.length > this.maxLines) {
            this.logContainer.textContent = lines.slice(lines.length - this.maxLines).join('\n');
        }
    }
}

export const SystemLog = new SystemLogComponent();
