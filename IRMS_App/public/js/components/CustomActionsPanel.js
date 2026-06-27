// components/CustomActionsPanel.js
import { EventBus } from '../core/EventBus.js';
import { StateManager } from '../core/StateManager.js';
import { ActionApi } from '../services/ActionApi.js';
import { showConfirm, closeModal } from '../utils/uiUtils.js';

class CustomActionsPanelComponent {
    constructor() {
        this.listEl = document.getElementById('actions-grid');
        this.emptyEl = document.getElementById('actions-list-empty');
        this.modal = document.getElementById('action-modal');
        this.form = document.getElementById('action-form');
        this.dropdown = document.getElementById('input-action');
        
        this.currentEditId = null;

        EventBus.on('LOAD_ACTIONS_VIEW', this.renderList.bind(this));
        EventBus.on('CUSTOM_ACTIONS_LOADED', this.renderList.bind(this));
        EventBus.on('CUSTOM_ACTIONS_LOADED', this.populateDropdown.bind(this));
        EventBus.on('PROTOCOL_CHANGED', this.populateDropdown.bind(this));

        this.bindEvents();
    }

    bindEvents() {
        const btnCreate = document.getElementById('btn-create-action');
        if (btnCreate) btnCreate.addEventListener('click', () => this.openModal());

        const btnCancel = document.getElementById('action-modal-cancel');
        if (btnCancel) btnCancel.addEventListener('click', () => closeModal(this.modal));

        if (this.form) {
            this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
        }

        if (this.listEl) {
            this.listEl.addEventListener('click', this.handleListClick.bind(this));
        }

        if (this.dropdown) {
            this.dropdown.addEventListener('change', (e) => {
                StateManager.set('selectedActionId', e.target.value);
                const actions = StateManager.get('customActions');
                const action = actions.find(a => a.id == e.target.value);
                if (action) {
                    EventBus.emit('ACTION_SELECTED', action);
                    // Apply defaults to UI
                    const inputTarget = document.getElementById('input-target');
                    const inputTolerance = document.getElementById('input-tolerance');
                    const inputHold = document.getElementById('input-hold');
                    const elTargetAngle = document.getElementById('target-angle');
                    const elTolerance = document.getElementById('tolerance-display');

                    if (inputTarget) inputTarget.value = action.targetAngle;
                    if (inputTolerance) inputTolerance.value = action.tolerance;
                    if (inputHold) inputHold.value = action.holdTimeMs;
                    if (elTargetAngle) elTargetAngle.innerHTML = `${action.targetAngle}&deg;`;
                    if (elTolerance) elTolerance.innerHTML = `&plusmn;${action.tolerance}&deg;`;
                }
            });
        }
        
        const btnRestoreDefaults = document.getElementById('btn-restore-defaults');
        if (btnRestoreDefaults) {
            btnRestoreDefaults.addEventListener('click', async () => {
                const confirmed = await showConfirm('還原預設', '這將會還原預設的復健動作範本，確定要執行嗎？');
                if (!confirmed) return;
                
                try {
                    const res = await fetch('/api/custom_actions/restore_defaults', { method: 'POST' });
                    if (res.ok) {
                        EventBus.emit('UI_SHOW_TOAST', { message: 'Default templates restored successfully.', type: 'success' });
                        await StateManager.loadCustomActions();
                    } else {
                        EventBus.emit('UI_SHOW_TOAST', { message: 'Failed to restore templates.', type: 'error' });
                    }
                } catch (e) {
                    EventBus.emit('UI_SHOW_TOAST', { message: `Error: ${e}`, type: 'error' });
                }
            });
        }
        
        const btnEmptyRestore = document.getElementById('empty-restore-defaults-btn');
        if (btnEmptyRestore && btnRestoreDefaults) {
            btnEmptyRestore.addEventListener('click', () => btnRestoreDefaults.click());
        }
    }

    renderList() {
        if (!this.listEl || !this.emptyEl) return;
        const actions = StateManager.get('customActions');
        const protocol = StateManager.get('cfgProtocol');

        this.listEl.innerHTML = '';
        
        const filteredActions = actions.filter(a => a.protocol === protocol);

        if (filteredActions.length === 0) {
            this.listEl.style.display = 'none';
            this.emptyEl.style.display = 'flex';
            return;
        }

        this.listEl.style.display = 'grid';
        this.emptyEl.style.display = 'none';

        filteredActions.forEach(action => {
            const card = document.createElement('div');
            card.className = 'action-card';
            card.innerHTML = `
                <div class="action-card-header">
                    <h4>${action.name}</h4>
                    <span class="badge badge-info">${action.triggerType}</span>
                </div>
                <div class="action-card-body">
                    <p><strong>Target:</strong> ${action.targetAngle}°</p>
                    <p><strong>Tolerance:</strong> ±${action.tolerance}°</p>
                    <p><strong>Hold:</strong> ${action.holdTimeMs}ms</p>
                    ${action.description ? `<p class="action-desc">${action.description}</p>` : ''}
                </div>
                <div class="action-card-actions">
                    <button class="secondary-btn btn-sm btn-edit-action" data-id="${action.id}">Edit</button>
                    <button class="danger-btn btn-sm btn-delete-action" data-id="${action.id}">Delete</button>
                </div>
            `;
            this.listEl.appendChild(card);
        });
    }

    populateDropdown() {
        if (!this.dropdown) return;
        
        const actions = StateManager.get('customActions');
        const protocol = StateManager.get('cfgProtocol');
        
        this.dropdown.innerHTML = '';
        const filteredActions = actions.filter(a => a.protocol === protocol);
        
        filteredActions.forEach(action => {
            const opt = document.createElement('option');
            opt.value = action.id;
            opt.textContent = action.name;
            this.dropdown.appendChild(opt);
        });
        
        if (filteredActions.length > 0) {
            StateManager.set('selectedActionId', filteredActions[0].id);
            // Trigger change event to load defaults
            this.dropdown.dispatchEvent(new Event('change'));
        } else {
            StateManager.set('selectedActionId', null);
            EventBus.emit('UI_SHOW_TOAST', { message: 'No actions available for this protocol.', type: 'warning' });
        }
        
        EventBus.emit('BLE_STATUS_UPDATE', StateManager.get('isConnected') ? `Connected to ${StateManager.get('deviceName')}` : 'Disconnected');
    }

    openModal(action = null) {
        if (!this.modal) return;
        this.currentEditId = action ? action.id : null;
        
        document.getElementById('action-modal-title').innerText = action ? 'Edit Custom Action' : 'Create Custom Action';
        document.getElementById('action-id').value = action ? action.id : '';
        document.getElementById('action-name').value = action ? action.name : '';
        document.getElementById('action-desc').value = action ? (action.description || '') : '';
        document.getElementById('action-trigger').value = action ? action.triggerType : 'joint_angle';
        document.getElementById('action-target').value = action ? action.targetAngle : 90;
        document.getElementById('action-tolerance').value = action ? action.tolerance : 10;
        document.getElementById('action-hold').value = action ? action.holdTimeMs : 3000;
        
        this.modal.style.display = 'flex';
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const payload = {
            name: document.getElementById('action-name').value,
            description: document.getElementById('action-desc').value,
            triggerType: document.getElementById('action-trigger').value,
            targetAngle: parseFloat(document.getElementById('action-target').value),
            tolerance: parseFloat(document.getElementById('action-tolerance').value),
            holdTimeMs: parseInt(document.getElementById('action-hold').value, 10),
            protocol: StateManager.get('cfgProtocol')
        };
        
        try {
            if (this.currentEditId) {
                await ActionApi.update(this.currentEditId, payload);
                EventBus.emit('UI_SHOW_TOAST', { message: 'Action updated successfully!', type: 'success' });
            } else {
                await ActionApi.create(payload);
                EventBus.emit('UI_SHOW_TOAST', { message: 'Action created successfully!', type: 'success' });
            }
            closeModal(this.modal);
            await StateManager.loadCustomActions();
        } catch (err) {
            EventBus.emit('UI_SHOW_TOAST', { message: 'Failed to save action.', type: 'error' });
        }
    }

    async handleListClick(e) {
        if (e.target.classList.contains('btn-edit-action')) {
            const id = e.target.getAttribute('data-id');
            const action = StateManager.get('customActions').find(a => a.id == id);
            if (action) this.openModal(action);
        } else if (e.target.classList.contains('btn-delete-action')) {
            const id = e.target.getAttribute('data-id');
            const confirmed = await showConfirm('刪除動作', '確定要刪除此自定義動作嗎？此操作不可撤銷。');
            if (confirmed) {
                try {
                    await ActionApi.delete(id);
                    EventBus.emit('UI_SHOW_TOAST', { message: 'Action deleted successfully.', type: 'success' });
                    await StateManager.loadCustomActions();
                } catch (err) {
                    EventBus.emit('UI_SHOW_TOAST', { message: 'Failed to delete custom action.', type: 'error' });
                }
            }
        }
    }
}

export const CustomActionsPanel = new CustomActionsPanelComponent();
