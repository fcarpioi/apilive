import * as getRawBody from "raw-body";

export default async function rawBodyMiddleware(req, res, next) {
  try {
    if (req.headers["content-type"]?.startsWith("multipart/form-data")) {
      req.rawBody = await getRawBody.default(req, { limit: "50mb" });
    }
    next();
  } catch (error) {
    console.error("❌ Error en rawBodyMiddleware:", error);
    res.status(500).json({ message: "Error procesando el cuerpo de la solicitud", error: error.message });
  }
}