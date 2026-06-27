// components/ChartWidget.js
import { EventBus } from '../core/EventBus.js';
import { StateManager } from '../core/StateManager.js';

class ChartWidgetComponent {
    constructor() {
        this.ctx = document.getElementById('angleChart')?.getContext('2d');
        if (!this.ctx) return;

        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: '夾角 (Knee)',
                    data: [],
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    fill: true,
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    pointRadius: 0,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#9ca3af', maxTicksLimit: 10 }
                    },
                    y: {
                        beginAtZero: true,
                        suggestedMax: 150,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#9ca3af' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#f3f4f6' } },
                    tooltip: { enabled: true }
                }
            }
        });

        EventBus.on('BLE_DATA_RECEIVED', this.updateChart.bind(this));
        EventBus.on('SESSION_STARTED', this.resetChart.bind(this));
    }

    updateChart(angles) {
        const { knee, thigh, shin } = angles;
        const now = new Date().toLocaleTimeString();
        
        this.chart.data.labels.push(now);
        
        if (this.chart.data.datasets.length === 1) {
            this.chart.data.datasets.push({
                label: '大腿 (Thigh)',
                data: [],
                borderColor: '#f59e0b',
                borderWidth: 1,
                fill: false,
                pointRadius: 0
            });
            this.chart.data.datasets.push({
                label: '小腿 (Shin)',
                data: [],
                borderColor: '#10b981',
                borderWidth: 1,
                fill: false,
                pointRadius: 0
            });
        }
        
        this.chart.data.datasets[0].data.push(knee);
        
        if (this.chart.data.datasets.length > 1) {
            this.chart.data.datasets[1].data.push(thigh);
            this.chart.data.datasets[2].data.push(shin);
        }
        
        const maxPoints = StateManager.get('cfgMaxChartPoints');
        if (this.chart.data.labels.length > maxPoints) {
            this.chart.data.labels.shift();
            this.chart.data.datasets.forEach(ds => ds.data.shift());
        }
        this.chart.update();
    }

    resetChart() {
        this.chart.data.labels = [];
        this.chart.data.datasets.forEach(ds => ds.data = []);
        this.chart.update();
    }
}

export const ChartWidget = new ChartWidgetComponent();
