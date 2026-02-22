import admin from "firebase-admin";

export async function sendCheckpointNotificationToFollowers({
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

    const participantDoc = await participantRef.get();
    const participantData = participantDoc.exists ? participantDoc.data() : {};
    const participantName = participantData?.fullName || participantData?.name || `Participante ${participantId}`;
    const checkpointName = checkpointInfo?.point || checkpointInfo?.location || "checkpoint";

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

    const message = {
        notification: {
            title: "Nuevo checkpoint",
            body: `${participantName} pasó por ${checkpointName}`
        },
        data: {
            notificationType: "checkpoint_update",
            timestamp: new Date().toISOString(),
            raceId: raceId || "",
            appId: appId || "",
            eventId: eventId || "",
            participantId: participantId || "",
            checkpoint: checkpointName || ""
        },
        android: {
            priority: "high"
        },
        apns: {
            payload: {
                aps: {
                    sound: "default"
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
