export function normalizeUTF8InObject(obj) {
    if (typeof obj === 'string') {
        // Detectar y corregir doble encoding UTF-8
        try {
            let normalized = obj;

            // Corregir secuencias comunes de doble encoding
            const replacements = {
                'Ã³': 'ó',
                'Ã¡': 'á',
                'Ã©': 'é',
                'Ã­': 'í',
                'Ãº': 'ú',
                'Ã±': 'ñ',
                'Ã': 'Á',
                'Ã‰': 'É',
                // 'Ã': 'Í',
                'Ã"': 'Ó',
                'Ãš': 'Ú',
                'Ã\u0091': 'Ñ'
            };

            for (const [corrupted, correct] of Object.entries(replacements)) {
                normalized = normalized.replace(new RegExp(corrupted, 'g'), correct);
            }

            console.log(`🔤 UTF-8 normalizado: "${obj}" → "${normalized}"`);
            return normalized;
        } catch (error) {
            console.warn('Error normalizando UTF-8:', error);
            return obj;
        }
    } else if (Array.isArray(obj)) {
        return obj.map(item => normalizeUTF8InObject(item));
    } else if (obj && typeof obj === 'object') {
        const normalized = {};
        for (const [key, value] of Object.entries(obj)) {
            normalized[normalizeUTF8InObject(key)] = normalizeUTF8InObject(value);
        }
        return normalized;
    }
    return obj;
}