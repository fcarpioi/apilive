export function normalizeGender(value) {
    if (!value) return null;
    const val = value.toString().trim().toLowerCase();
    if (["m", "male", "h", "masculino", "man"].includes(val)) return "male";
    if (["f", "female", "fem", "femenino", "woman"].includes(val)) return "female";
    return val; // devolver tal cual si ya viene como male/female u otra variante
}