// components/HistoryPanel.js
import { EventBus } from '../core/EventBus.js';
import { StateManager } from '../core/StateManager.js';
import { SessionApi } from '../services/SessionApi.js';
import { showConfirm, closeModal } from '../utils/uiUtils.js';

class HistoryPanelComponent {
    constructor() {
        this.historyBody = document.getElementById('history-tbody');
        this.emptyState = document.getElementById('history-empty');

        EventBus.on('LOAD_HISTORY_VIEW', this.loadHistory.bind(this));
        
        // Listen for history table clicks (event delegation)
        if (this.historyBody) {
            this.historyBody.addEventListener('click', this.handleTableClick.bind(this));
        }

        const modalClose = document.getElementById('session-modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                const modal = document.getElementById('session-modal');
                if (modal) closeModal(modal);
            });
        }
    }

    async loadHistory() {
        if (!this.historyBody || !this.emptyState) return;

        try {
            const sessions = await SessionApi.fetchHistory();
            this.historyBody.innerHTML = '';
            
            if (sessions.length === 0) {
                this.historyBody.parentElement.style.display = 'none';
                this.emptyState.style.display = 'flex';
                return;
            }
            
            this.historyBody.parentElement.style.display = 'table';
            this.emptyState.style.display = 'none';
            
            // Sort descending by ID
            sessions.sort((a, b) => b.id - a.id).forEach(session => {
                let actionName = session.action;
                // If it's an integer ID, try mapping to custom action name
                const customActions = StateManager.get('customActions');
                const customAction = customActions.find(a => a.id == session.action);
                if (customAction) {
                    actionName = customAction.name;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>#${session.id}</td>
                    <td>${new Date(session.startTime).toLocaleString()}</td>
                    <td>${actionName}</td>
                    <td>${session.repsCompleted || 0}</td>
                    <td>
                        <button class="primary-btn btn-sm btn-view-session" data-id="${session.id}">View Analysis</button>
                        <button class="danger-btn btn-sm btn-delete-session" data-id="${session.id}" title="Delete Session" style="padding: 0.25rem 0.5rem; margin-left: 0.5rem;">✕</button>
                    </td>
                `;
                this.historyBody.appendChild(tr);
            });
        } catch (e) {
            EventBus.emit('LOG_DEBUG', `Error loading history: ${e}`);
        }
    }

    async handleTableClick(e) {
        if (e.target.classList.contains('btn-view-session')) {
            const id = e.target.getAttribute('data-id');
            // Delegate opening modal to a separate modal manager or let UI handle it
            // Assuming openSessionModal exists globally or we handle it via event
            EventBus.emit('OPEN_SESSION_MODAL', id);
        } else if (e.target.classList.contains('btn-delete-session')) {
            const id = e.target.getAttribute('data-id');
            const confirmed = await showConfirm('刪除紀錄', `確定要刪除 Session #${id} 的紀錄嗎？`);
            if (confirmed) {
                try {
                    await SessionApi.delete(id);
                    EventBus.emit('UI_SHOW_TOAST', { message: `Session #${id} deleted.`, type: 'success' });
                    this.loadHistory();
                } catch (err) {
                    EventBus.emit('UI_SHOW_TOAST', { message: `Failed to delete session.`, type: 'error' });
                }
            }
        }
    }
}

export const HistoryPanel = new HistoryPanelComponent();
