// components/Navigation.js
import { EventBus } from '../core/EventBus.js';

class NavigationComponent {
    constructor() {
        this.navItems = [
            document.getElementById('nav-dashboard'),
            document.getElementById('nav-actions'),
            document.getElementById('nav-history'),
            document.getElementById('nav-settings')
        ];

        this.views = [
            document.getElementById('view-dashboard'),
            document.getElementById('view-actions'),
            document.getElementById('view-history'),
            document.getElementById('view-settings')
        ];

        this.viewMap = {
            'view-dashboard': 0,
            'view-actions': 1,
            'view-history': 2,
            'view-settings': 3
        };

        this.bindEvents();
        EventBus.on('SWITCH_VIEW', this.switchView.bind(this));
    }

    bindEvents() {
        if (this.navItems[0]) this.navItems[0].addEventListener('click', (e) => { e.preventDefault(); this.switchView('view-dashboard'); });
        if (this.navItems[1]) this.navItems[1].addEventListener('click', (e) => { e.preventDefault(); this.switchView('view-actions'); EventBus.emit('LOAD_ACTIONS_VIEW'); });
        if (this.navItems[2]) this.navItems[2].addEventListener('click', (e) => { e.preventDefault(); this.switchView('view-history'); EventBus.emit('LOAD_HISTORY_VIEW'); });
        if (this.navItems[3]) this.navItems[3].addEventListener('click', (e) => { e.preventDefault(); this.switchView('view-settings'); });

        const sidebarToggle = document.getElementById('sidebar-toggle');
        const sidebar = document.getElementById('sidebar');
        if (sidebarToggle && sidebar) {
            if (localStorage.getItem('irms_sidebar_collapsed') === 'true') sidebar.classList.add('collapsed');
            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                localStorage.setItem('irms_sidebar_collapsed', sidebar.classList.contains('collapsed'));
            });
        }
    }

    switchView(targetViewId) {
        const idx = this.viewMap[targetViewId];
        if (idx === undefined) return;
        
        this.navItems.forEach((n, i) => { 
            if (!n) return;
            if (i === idx) n.classList.add('active'); 
            else n.classList.remove('active'); 
        });
        
        this.views.forEach((v, i) => {
            if (!v) return;
            if (i === idx) {
                v.classList.add('view-active');
            } else {
                v.classList.remove('view-active');
            }
        });
    }
}

export const Navigation = new NavigationComponent();
