const moment = require('moment');
const ZKLib = require('node-zklib');
const NodeCache = require('node-cache');
const cron = require('node-cron');
const DB_Pool = require('../config/db');

const cache = new NodeCache({ stdTTL: 3600});   


const deviceIP = '192.168.68.203';
const devicePort = 4370;
const maxRetries = 3;  // Maximum retry attempts
const retryDelay = 2000;

const fetchAttendanceLogs = async (retryCount = 0) => {
    console.log("fetchAttendanceLogs start");
    
    const zkInstance = new ZKLib(deviceIP, devicePort, 200000, 4000);
    try {
        await zkInstance.createSocket();
        const { data } = await zkInstance.getAttendances();
        await zkInstance.disconnect();

        // Retry if data is not received
        if (!data) {
            if (retryCount < maxRetries) {
                console.log(`Retrying... Attempt ${retryCount + 1}`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return await fetchAttendanceLogs(retryCount + 1);
            } else {
                console.error("Failed to retrieve attendance data after multiple attempts.");
                return;
            }
        }

        if (!Array.isArray(data)) {
            throw new Error("Logs data is not an array");
        }

        // Today's date
        const today = moment().format('YYYY-MM-DD');

        // Filter logs for today's date
        const todayLogs = data.filter(log => moment(log.recordTime).format('YYYY-MM-DD') === today);

        // Group logs by user to determine clock-in and clock-out times
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

        // Format the logs for cache storage
        const attendanceSummary = Object.entries(userAttendance).map(([userId, times]) => ({
            userId,
            clockIn: times.clockIn.format('HH:mm:ss'),
            clockOut: times.clockOut.format('HH:mm:ss')
        }));

        // console.log("Attendance summary:", attendanceSummary);

        
        if(attendanceSummary.length > 0){
            cache.set('todayAttendance', attendanceSummary);
            console.log(attendanceSummary);
            
            console.log("Attendance data cached successfully at " + new Date().toISOString());
        }

        

        return attendanceSummary;
    } catch (error) {
        console.error("Error fetching attendance logs:", error.message || error);
    } finally {
        await zkInstance.disconnect();  // Ensure the device disconnects even if an error occurs
    }
};

// Schedule cache updates every 5 minutes
cron.schedule('*/1 * * * *', fetchAttendanceLogs);


// API Controller to retrieve cached logs
const getTodayLogs = async (req, res) => {
    try {
        const cachedData = cache.get('todayAttendance');
        if (cachedData) {
            return res.json({ success: true, data: cachedData });
        } else {
            // Fetch data immediately if not in cache (fallback)
            const attendance = await fetchAttendanceLogs();

            
            
            const fallbackData = cache.get('todayAttendance');
            return res.json({ success: true, data: fallbackData || [] });
        }
    } catch (error) {
        console.error("Error retrieving attendance logs:", error.message || error);
        res.status(500).json({ success: false, message: 'Could not retrieve attendance logs' });
    }
};




const saveAttendanceInDB = async () => {
    console.log("Saving attendance data to database...");

    const cachedData = cache.get('todayAttendance');

    console.log(cachedData);

    if (!cachedData || cachedData.length === 0) {
        console.log("No attendance data to save.");
        return;
    }

    const connection = await DB_Pool.promise().getConnection();
    if(connection){
        console.log("okay")
    }

    
    

    console.log("Cached data:", cachedData);

    try {
        await connection.beginTransaction();

        

        for (const record of cachedData) {
            const { userId, clockIn, clockOut } = record;
            const todayDate = moment().format('YYYY-MM-DD');

            console.log(`Processing record for userId: ${userId}, Date: ${todayDate}`);

            // Check if today's attendance record already exists
            const [existingRecord] = await connection.execute(
                `SELECT id FROM AttendanceMachine WHERE userId = ? AND DATE(recordDate) = ?`,
                [userId, todayDate]
            );

            if (existingRecord.length > 0) {
                console.log(`Record exists for userId: ${userId}, updating clockOut to ${clockOut}`);

                await connection.execute(
                    `UPDATE AttendanceMachine SET clockOut = ? WHERE id = ?`,
                    [clockOut, existingRecord[0].id]
                );
                console.log(`Updated clockOut for user ${userId} to ${clockOut}`);
            } else {
                console.log(`No existing record for userId: ${userId}, inserting new record.`);

                await connection.execute(
                    `INSERT INTO AttendanceMachine (userId, clockIn, clockOut, recordDate) VALUES (?, ?, ?, ?)`,
                    [userId, clockIn, clockOut, todayDate]
                );
                console.log(`Inserted new attendance record for user ${userId}`);
            }
        }

        await connection.commit();
        console.log("Attendance data saved successfully.");
    } catch (error) {
        await connection.rollback();
        console.error("Error saving attendance data:", error.message, error.code); // Log error code for more insight
    } finally {
        connection.release();
    }
};







cron.schedule('*/1 * * * *', saveAttendanceInDB);






module.exports = getTodayLogs;
