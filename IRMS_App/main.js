const { app, BrowserWindow } = require('electron');
const path = require('path');
const { startServer } = require('./server'); // Import Express backend

let mainWindow;

// Force enable Web Bluetooth
app.commandLine.appendSwitch('enable-web-bluetooth', 'true');
app.commandLine.appendSwitch('enable-experimental-web-platform-features', 'true');

async function createWindow() {
    // Start backend server first
    await startServer();

    mainWindow = new BrowserWindow({
        width: 1100,
        height: 700,
        minWidth: 900,
        minHeight: 600,
        title: 'IRMS Dashboard',
        autoHideMenuBar: true, // Clean desktop app look
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Grant Bluetooth permissions
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
        if (permission === 'bluetooth') return callback(true);
        callback(true);
    });
    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        if (permission === 'bluetooth') return true;
        return true;
    });
    mainWindow.webContents.session.setDevicePermissionHandler((details) => {
        return details.deviceType === 'bluetooth' || details.deviceType === 'usb';
    });
    
    // Auto-accept Bluetooth pairing requests
    mainWindow.webContents.session.setBluetoothPairingHandler((details, callback) => {
        callback({
            initiatingOrigin: details.initiatingOrigin,
            deviceId: details.deviceId,
            accept: true
        });
    });

    // Handle Web Bluetooth device selection automatically
    let selectBluetoothCallback = null;
    
    mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
        event.preventDefault(); // Prevent default browser picker
        selectBluetoothCallback = callback;
        
        if (deviceList && deviceList.length > 0) {
            console.log('Discovered BT Devices (initial):', deviceList.map(d => d.deviceName));
        }
        
        const targetDevice = deviceList.find(d => d.deviceName && d.deviceName.includes('IRMS'));
        if (targetDevice) {
            console.log(`Auto-pairing with matched device: ${targetDevice.deviceName} (${targetDevice.deviceId})`);
            selectBluetoothCallback(targetDevice.deviceId);
            selectBluetoothCallback = null;
        }
    });

    // Handle subsequently discovered devices
    mainWindow.webContents.on('bluetooth-device-added', (event, device) => {
        if (device.deviceName) {
            console.log('BT Device added:', device.deviceName);
        }
        if (selectBluetoothCallback && device.deviceName && device.deviceName.includes('IRMS')) {
            console.log(`Auto-pairing with matched device (delayed): ${device.deviceName} (${device.deviceId})`);
            selectBluetoothCallback(device.deviceId);
            selectBluetoothCallback = null;
        }
    });

    mainWindow.webContents.on('bluetooth-device-updated', (event, device) => {
        if (selectBluetoothCallback && device.deviceName && device.deviceName.includes('IRMS')) {
            console.log(`Auto-pairing with matched device (updated): ${device.deviceName} (${device.deviceId})`);
            selectBluetoothCallback(device.deviceId);
            selectBluetoothCallback = null;
        }
    });

    // Load the Express server URL
    mainWindow.loadURL('http://localhost:3000');
    
    // Open devtools by default for debugging
    if (process.env.NODE_ENV !== 'production') {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
