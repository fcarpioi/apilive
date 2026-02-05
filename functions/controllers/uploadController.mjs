import B2 from 'backblaze-b2';

const b2Config = {
  applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY
};

if (!b2Config.applicationKeyId || !b2Config.applicationKey) {
  console.warn("⚠️ Backblaze B2 keys missing: set B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY.");
}

const b2 = new B2(b2Config);

export const uploadToB2 = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }

    // Autorizar con Backblaze B2
    await b2.authorize();
    console.log('Autorización con B2 exitosa');

    // Obtener URL de subida
    const bucketId = process.env.B2_BUCKET_ID;
    if (!bucketId) {
      return res.status(500).json({ error: 'B2_BUCKET_ID not configured' });
    }
    const { data: uploadUrlData } = await b2.getUploadUrl({ bucketId });
    const { uploadUrl, authorizationToken } = uploadUrlData;

    // Nombre único para el archivo
    const fileName = `${Date.now()}_${req.file.originalname}`;
    const fileData = req.file.buffer;

    // Subir el archivo
    const { data: uploadResponse } = await b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName,
      data: fileData,
      contentType: req.file.mimetype,
    });

    // URL pública (ajustar según tu bucket y región)
    const baseUrl = process.env.B2_PUBLIC_BASE_URL || "";
    const fileUrl = baseUrl ? `${baseUrl}/${fileName}` : "";

    res.status(200).json({
      message: 'Archivo subido con éxito',
      fileId: uploadResponse.fileId,
      fileUrl,
    });
  } catch (error) {
    console.error('Error al subir archivo:', error);
    res.status(500).json({ error: 'Error al subir el archivo', details: error.message });
  }
};
