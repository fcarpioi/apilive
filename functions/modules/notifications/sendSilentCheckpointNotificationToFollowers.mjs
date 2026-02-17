import admin from "firebase-admin";

export async function sendSilentCheckpointNotificationToFollowers({
                                                                      db,
                                                                      raceId,
                                                                      appId,
                                                                      eventId,
                                                                      participantId,
                                                                      checkpointInfo
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

    const dataPayload = {
        notificationType: 'silent_data_sync',
        silent: 'true',
        timestamp: new Date().toISOString(),
        raceId: raceId || '',
        appId: appId || '',
        eventId: eventId || '',
        participantId: participantId || ''
    };

    const message = {
        data: dataPayload,
        android: {
            priority: 'high'
        },
        apns: {
            payload: {
                aps: {
                    'content-available': 1
                }
            }
        }
    };

    const chunkSize = 500;
    for (let i = 0; i < tokens.length; i += chunkSize) {
        const chunk = tokens.slice(i, i + chunkSize);
        await admin.messaging().sendEachForMulticast({
            tokens: chunk,
            ...message
        });
    }
}