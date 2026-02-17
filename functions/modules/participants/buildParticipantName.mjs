export function buildParticipantName(data = {}) {
    if (data.fullName) return data.fullName;
    const name = data.name || "";
    const lastName = data.lastName || "";
    return `${name} ${lastName}`.trim();
}