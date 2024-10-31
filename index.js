const express = require('express');
const ZKLib = require('node-zklib');
const moment = require('moment');
const getTodayLogs = require('./src/utils/getTodayLogs');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json())

// IP and Port configuration for the ZKTeco device
const deviceIP = '192.168.68.203';
const devicePort = 4370;

// Function to connect and retrieve general information from the ZKTeco device
const getDeviceInfo = async () => {
    const zkInstance = new ZKLib(deviceIP, devicePort, 10000, 10000);
    try {
        // Connect to the device
        await zkInstance.createSocket();
        
        // Fetch general information
        const info = await zkInstance.getInfo();
        await zkInstance.disconnect();
        return info;
    } catch (error) {
        console.error("Error in getDeviceInfo:", error.message || error);
        return null;
    }
};

// Endpoint to fetch device info
app.get('/device-info', async (req, res) => {
    try {
        const info = await getDeviceInfo();
        if (!info) throw new Error("No info retrieved");
        console.log("Device Info:", info);
        res.json({ success: true, data: info });
    } catch (error) {
        console.error("Error retrieving device info:", error.message || error);
        res.status(500).json({ success: false, message: 'Could not retrieve device info' });
    }
});


app.get('/attendance-logs', getTodayLogs);



       


// Endpoint to fetch users from the device
app.get('/users', async (req, res) => {
    const zkInstance = new ZKLib(deviceIP, devicePort, 10000, 4000);
    try {
        await zkInstance.createSocket();
        const users = await zkInstance.getUsers();
        await zkInstance.disconnect();
        if (!users) throw new Error("No users retrieved");
        console.log("Users:", users);
        res.json({ success: true, data: users });
    } catch (error) {
        console.error("Error retrieving users:", error.message || error);
        res.status(500).json({ success: false, message: 'Could not retrieve user data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
