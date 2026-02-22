import {createStoryNotificationPayload} from "./createStoryNotificationPayload.mjs";
import admin from "firebase-admin";

export async function sendStoryNotificationToFollowers({
                                                    db,
                                                    raceId,
                                                    appId,
                                                    eventId,
                                                    participantId,
                                                    storyId,
                                                    storyData,
                                                    participantData,
                                                    notificationOverrides = {}
                                                }) {
    const participantRef = db.collection('races').doc(raceId)
        .collection('apps').doc(appId)
        .collection('events').doc(eventId)
        .collection('participants')
        .doc(participantId);

    const followersSnapshot = await participantRef.collection('followers').get();
    if (followersSnapshot.empty) {
        return;
    }

    const followerUserIds = followersSnapshot.docs.map(doc => doc.id);
    const tokens = [];

    for (const userId of followerUserIds) {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists && userDoc.data().fcmToken) {
            tokens.push(userDoc.data().fcmToken);
        }
    }

    if (tokens.length === 0) {
        return;
    }

    const payload = createStoryNotificationPayload(storyData, participantData, {
        raceId,
        appId,
        eventId,
        participantId,
        storyId
    });

    if (notificationOverrides.title) {
        payload.notification.title = notificationOverrides.title;
        if (payload.apns?.payload?.aps?.alert) {
            payload.apns.payload.aps.alert.title = notificationOverrides.title;
        }
    }
    if (notificationOverrides.body) {
        payload.notification.body = notificationOverrides.body;
        if (payload.apns?.payload?.aps?.alert) {
            payload.apns.payload.aps.alert.body = notificationOverrides.body;
        }
    }
    if (notificationOverrides.notificationType) {
        payload.data.notificationType = notificationOverrides.notificationType;
    }
    if (notificationOverrides.description) {
        payload.data.description = notificationOverrides.description;
    }

    const chunkSize = 500;
    for (let i = 0; i < tokens.length; i += chunkSize) {
        const chunk = tokens.slice(i, i + chunkSize);
        await admin.messaging().sendEachForMulticast({
            tokens: chunk,
            notification: payload.notification,
            data: payload.data,
            android: payload.android,
            apns: payload.apns
        });
    }
}
