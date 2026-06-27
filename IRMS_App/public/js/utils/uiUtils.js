export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const iconMap = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div class="toast-icon">${iconMap[type] || iconMap.info}</div><div class="toast-message">${message}</div><button class="toast-close">&times;</button>`;
    container.appendChild(toast);
    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); };
    closeBtn.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
}

export function showConfirm(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `<div class="confirm-dialog"><h3>${title}</h3><p>${message}</p><div class="confirm-actions"><button class="secondary-btn" id="confirm-cancel">取消</button><button class="danger-btn" id="confirm-ok">確認</button></div></div>`;
        document.body.appendChild(overlay);
        
        const btnOk = overlay.querySelector('#confirm-ok');
        const btnCancel = overlay.querySelector('#confirm-cancel');
        
        btnOk.addEventListener('click', () => { overlay.remove(); resolve(true); });
        btnCancel.addEventListener('click', () => { overlay.remove(); resolve(false); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
        
        setTimeout(() => btnOk.focus(), 10);
    });
}

export function closeModal(modalEl, callback) {
    modalEl.classList.add('modal-closing');
    setTimeout(() => {
        modalEl.style.display = 'none';
        modalEl.classList.remove('modal-closing');
        if (callback) callback();
    }, 200);
}
