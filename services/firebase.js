// Firebase Admin SDK will be configured here for push notifications
// You'll need to add your Firebase service account key

const admin = require('firebase-admin');

let firebaseInitialized = false;

/**
 * Initialize Firebase Admin SDK
 * Note: You need to download your service account key from Firebase Console
 * and save it as 'firebase-service-account.json' in the server directory
 */
function initializeFirebase() {
    if (firebaseInitialized) return;

    try {
        // Check if service account file exists
        const fs = require('fs');
        const path = require('path');
        const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');

        if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = require(serviceAccountPath);

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });

            firebaseInitialized = true;
            console.log('✅ Firebase Admin SDK initialized successfully');
        } else {
            console.warn('⚠️  Firebase service account key not found. Push notifications will not work.');
            console.warn('   Download your key from Firebase Console and save as firebase-service-account.json');
        }
    } catch (error) {
        console.error('❌ Failed to initialize Firebase:', error.message);
    }
}

/**
 * Send a push notification to a device
 * @param {string} token - FCM device token
 * @param {object} notification - Notification payload
 */
async function sendPushNotification(token, notification) {
    if (!firebaseInitialized) {
        console.warn('Firebase not initialized. Skipping push notification.');
        return { success: false, error: 'Firebase not configured' };
    }

    try {
        const message = {
            notification: {
                title: notification.title,
                body: notification.body
            },
            data: notification.data || {},
            token: token
        };

        const response = await admin.messaging().send(message);
        console.log('✅ Push notification sent:', response);
        return { success: true, messageId: response };
    } catch (error) {
        console.error('❌ Error sending push notification:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send push notification to multiple devices
 * @param {Array<string>} tokens - Array of FCM device tokens
 * @param {object} notification - Notification payload
 */
async function sendMulticastNotification(tokens, notification) {
    if (!firebaseInitialized) {
        console.warn('Firebase not initialized. Skipping push notification.');
        return { success: false, error: 'Firebase not configured' };
    }

    try {
        const message = {
            notification: {
                title: notification.title,
                body: notification.body
            },
            data: notification.data || {},
            tokens: tokens
        };

        const response = await admin.messaging().sendMulticast(message);
        console.log(`✅ Sent ${response.successCount} notifications successfully`);
        return {
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount
        };
    } catch (error) {
        console.error('❌ Error sending multicast notification:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    initializeFirebase,
    sendPushNotification,
    sendMulticastNotification
};
