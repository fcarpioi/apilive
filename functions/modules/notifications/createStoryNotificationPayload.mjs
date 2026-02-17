export function createStoryNotificationPayload(storyData, participantData, storyInfo) {
    const participantName = participantData.fullName || participantData.name || 'Atleta';
    const dorsal = participantData.dorsal || 'Sin dorsal';
    const storyType = storyData.type || storyData.checkpointInfo?.type || 'unknown';

    let eventType;
    let emoji;

    if (storyType === 'ATHLETE_STARTED') {
        eventType = 'started the race';
        emoji = '🚀';
    } else if (storyType === 'ATHLETE_FINISHED') {
        eventType = 'finished the race';
        emoji = '🏁';
    } else if (storyType === 'ATHLETE_CROSSED_TIMING_SPLIT') {
        const checkpoint = storyData.split_time?.checkpoint || storyData.checkpointInfo?.point || 'checkpoint';
        eventType = `passed through ${checkpoint}`;
        emoji = '⏱️';
    } else {
        const checkpointPoint = storyData.checkpointInfo?.point || storyData.split_time?.checkpoint || 'checkpoint';
        eventType = `passed through ${checkpointPoint}`;
        emoji = '🏃';
    }

    const title = `${emoji} ${participantName} (#${dorsal})`;
    const body = `${eventType}${storyData.split_time?.time ? ` - Tiempo: ${storyData.split_time.time}` : ''}`;

    let imageUrl = null;
    const potentialImageUrl = storyData.image_url || storyData.video_url || storyData.fileUrl;
    if (potentialImageUrl && typeof potentialImageUrl === 'string' && potentialImageUrl.startsWith('http')) {
        imageUrl = potentialImageUrl;
    }

    const mediaType =
        storyData.video_url || storyData.fileUrl
            ? 'video'
            : (storyData.image_url ? 'image' : 'none');

    const compactMeta = {
        storyId: storyInfo.storyId,
        participantId: storyInfo.participantId,
        raceId: storyInfo.raceId,
        eventId: storyInfo.eventId,
        storyType: storyType,
        checkpoint: storyData.checkpointInfo?.point || storyData.split_time?.checkpoint || '',
        mediaType: mediaType
    };

    return {
        notification: {
            title: title,
            body: body,
            ...(imageUrl && {imageUrl: imageUrl})
        },
        data: {
            notificationType: "NEW_STORY",
            storyId: storyInfo.storyId,
            participantId: storyInfo.participantId,
            timestamp: new Date().toISOString(),
            raceId: storyInfo.raceId,
            appId: storyInfo.appId,
            eventId: storyInfo.eventId,
            storyType: storyType,
            participantName: participantName,
            participantDorsal: dorsal,
            checkpointTime: storyData.split_time?.time || '',
            checkpointName: storyData.split_time?.checkpoint || '',
            mediaUrl: storyData.video_url || storyData.image_url || storyData.fileUrl || '',
            mediaType: mediaType,
            description: storyData.description || '',
            storyMeta: JSON.stringify(compactMeta)
        },
        android: {
            priority: 'high',
            notification: {
                icon: 'ic_notification',
                color: '#FF6B35',
                sound: 'default',
                channelId: 'story_notifications'
            },
            data: {}
        },
        apns: {
            payload: {
                aps: {
                    alert: {
                        title: title,
                        body: body
                    },
                    badge: 1,
                    sound: 'default',
                    category: 'STORY_NOTIFICATION',
                    'mutable-content': 1
                }
            }
        }
    };
}