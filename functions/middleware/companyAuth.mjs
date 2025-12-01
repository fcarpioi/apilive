// companyAuth.mjs - Middleware de autenticación por empresa/subdominio
import admin from "firebase-admin";

/**
 * Middleware para validar acceso de usuario a empresa específica
 */
export const validateCompanyAccess = async (req, res, next) => {
  try {
    console.log("🔐 Validando acceso por empresa...");
    
    // 1. Extraer información del request
    const { userId, companyId } = req.body;
    const subdomain = extractSubdomain(req);
    const authHeader = req.headers.authorization;
    
    console.log("📋 Datos de validación:", {
      userId,
      companyId,
      subdomain,
      hasAuthHeader: !!authHeader
    });

    // 2. Validar que tenemos los datos necesarios
    if (!userId) {
      return res.status(400).json({
        error: "userId es requerido",
        code: "MISSING_USER_ID"
      });
    }

    // 3. Determinar empresa objetivo
    let targetCompany = companyId;
    
    // Si no hay companyId, intentar determinar por subdominio
    if (!targetCompany && subdomain) {
      targetCompany = await getCompanyBySubdomain(subdomain);
    }

    if (!targetCompany) {
      return res.status(400).json({
        error: "No se pudo determinar la empresa objetivo",
        code: "COMPANY_NOT_DETERMINED",
        subdomain,
        companyId
      });
    }

    // 4. Verificar acceso del usuario a la empresa
    const hasAccess = await checkUserCompanyAccess(userId, targetCompany);
    
    if (!hasAccess) {
      console.error(`❌ Usuario ${userId} no tiene acceso a empresa ${targetCompany}`);
      return res.status(403).json({
        error: "No tienes acceso a esta empresa",
        code: "COMPANY_ACCESS_DENIED",
        userId,
        company: targetCompany,
        subdomain
      });
    }

    // 5. Agregar información de empresa al request
    req.userCompany = {
      userId,
      companyId: targetCompany,
      subdomain,
      accessValidated: true
    };

    console.log(`✅ Acceso validado para usuario ${userId} en empresa ${targetCompany}`);
    next();

  } catch (error) {
    console.error("❌ Error en validación de empresa:", error);
    return res.status(500).json({
      error: "Error interno en validación de empresa",
      code: "COMPANY_VALIDATION_ERROR"
    });
  }
};

/**
 * Extraer subdominio del request
 */
function extractSubdomain(req) {
  const host = req.get('host') || req.headers['x-forwarded-host'] || '';
  const subdomain = req.headers['x-subdomain'] || '';
  
  // Si viene en header específico
  if (subdomain) {
    return subdomain.toLowerCase();
  }
  
  // Extraer del host
  const parts = host.split('.');
  if (parts.length >= 3) {
    return parts[0].toLowerCase();
  }
  
  return null;
}

/**
 * Obtener empresa por subdominio
 */
async function getCompanyBySubdomain(subdomain) {
  try {
    const db = admin.firestore();
    
    // Mapeo de subdominios conocidos
    const subdomainMap = {
      'cronochip': 'cronochip-company-id',
      'timingsense': 'timingsense-company-id',
      // Agregar más según necesidad
    };
    
    // Buscar en mapeo directo
    if (subdomainMap[subdomain]) {
      return subdomainMap[subdomain];
    }
    
    // Buscar en Firestore si hay configuración dinámica
    const companyQuery = await db.collection('companies')
      .where('subdomain', '==', subdomain)
      .limit(1)
      .get();
    
    if (!companyQuery.empty) {
      return companyQuery.docs[0].id;
    }
    
    return null;
  } catch (error) {
    console.error("Error obteniendo empresa por subdominio:", error);
    return null;
  }
}

/**
 * Verificar si usuario tiene acceso a empresa
 */
async function checkUserCompanyAccess(userId, companyId) {
  try {
    const db = admin.firestore();
    
    // 1. Obtener datos del usuario
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.error(`Usuario ${userId} no encontrado`);
      return false;
    }
    
    const userData = userDoc.data();
    
    // 2. Verificar acceso directo en campo companies
    if (userData.companies && Array.isArray(userData.companies)) {
      if (userData.companies.includes(companyId)) {
        return true;
      }
    }
    
    // 3. Verificar en colección de permisos
    const permissionDoc = await db.collection('userCompanyPermissions')
      .doc(`${userId}_${companyId}`)
      .get();
    
    if (permissionDoc.exists) {
      const permission = permissionDoc.data();
      return permission.active === true;
    }
    
    // 4. Verificar acceso por roles
    if (userData.roles && Array.isArray(userData.roles)) {
      const hasAdminRole = userData.roles.includes('admin') || userData.roles.includes('super_admin');
      if (hasAdminRole) {
        return true; // Admins tienen acceso a todas las empresas
      }
    }
    
    return false;
  } catch (error) {
    console.error("Error verificando acceso de usuario a empresa:", error);
    return false;
  }
}

export default validateCompanyAccess;
