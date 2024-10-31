const moment = require('moment');
const ZKLib = require('node-zklib');


const deviceIP = '192.168.68.203';
const devicePort = 4370;


const getTodayLogs = async (req, res) => {
    const zkInstance = new ZKLib(deviceIP, devicePort, 10000, 4000);
    try {
        await zkInstance.createSocket();
        const { data } = await zkInstance.getAttendances();
        await zkInstance.disconnect();


        if (!Array.isArray(data)) {
            throw new Error("Logs data is not an array");
        }

        // Today's date
        const today = moment().format('YYYY-MM-DD');

        // Filter logs for today's date
        const todayLogs = data.filter(log => {
            const logDate = moment(log.recordTime).format('YYYY-MM-DD');

            return logDate === today;
        });

        if (todayLogs.length === 0) {
            console.log("No logs found for today.");
        } else {
            console.log("Today's filtered logs:", todayLogs);
        }


        // Group by user and find the first and last record for each
        const userAttendance = {};

        todayLogs.forEach(log => {
            const userId = log.deviceUserId;
            const recordTime = moment(log.recordTime);

            if (!userAttendance[userId]) {
                userAttendance[userId] = { clockIn: recordTime, clockOut: recordTime };
            } else {
                if (recordTime.isBefore(userAttendance[userId].clockIn)) {
                    userAttendance[userId].clockIn = recordTime;
                }
                if (recordTime.isAfter(userAttendance[userId].clockOut)) {
                    userAttendance[userId].clockOut = recordTime;
                }
            }
        });

        // console.log(userAttendance);
        

        // Format the response for readability
        const response = Object.entries(userAttendance).map(([userId, times]) => ({
            userId,
            clockIn: times.clockIn.format('HH:mm:ss'),
            clockOut: times.clockOut.format('HH:mm:ss')
        }));


        console.log("Today's Attendance Summary:", response);
        res.json({ success: true, data: response });
    } catch (error) {
        console.error("Error retrieving attendance logs:", error.message || error);
        res.status(500).json({ success: false, message: 'Could not retrieve attendance logs' });
    }
};

module.exports = getTodayLogs;