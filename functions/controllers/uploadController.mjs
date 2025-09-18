import B2 from 'backblaze-b2';

const b2 = new B2({
  applicationKeyId: '003f9b4aeb02d5e0000000002', // Key ID correcto
  applicationKey: 'K0031zsdF1J6Gj2zPOlDaRzei7y9XwI', // Application Key correcto
});

export const uploadToB2 = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
    }

    // Autorizar con Backblaze B2
    await b2.authorize();
    console.log('Autorización con B2 exitosa');

    // Obtener URL de subida
    const bucketId = '4f69eb541a9e1b30925d051e'; // Bucket ID correcto
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
    const fileUrl = `https://f000.backblazeb2.com/file/<NOMBRE_DEL_BUCKET>/${fileName}`; // Ajusta esto

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