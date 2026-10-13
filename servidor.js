
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

// Configuración compatible con Render
const PORT = process.env.PORT || 3000;
const BASE = __dirname;

// Carpetas para guardar fotografías y dedicatorias
const CARPETA_FOTOS = path.join(BASE, "fotos");
const CARPETA_DEDICATORIAS = path.join(BASE, "dedicatorias");

// Crear las carpetas si no existen
fs.mkdirSync(CARPETA_FOTOS, { recursive: true });
fs.mkdirSync(CARPETA_DEDICATORIAS, { recursive: true });

app.disable("x-powered-by");
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Página principal: invitación completa
app.get("/", (req, res) => {
  res.sendFile(path.join(BASE, "Index.html"));
});

// Página para subir fotografías y dedicatorias
app.get("/fotos.html", (req, res) => {
  res.sendFile(path.join(BASE, "fotos.html"));
});

// Permitir cargar imágenes, música y otros recursos públicos
// sin exponer archivos del servidor ni las carpetas de datos.
const extensionesPermitidas = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
  ".mp3",
  ".wav",
  ".ogg",
  ".css",
  ".woff",
  ".woff2"
]);

app.get("/:archivo", (req, res, next) => {
  const archivo = req.params.archivo;

  // Evitar rutas que incluyan directorios
  if (path.basename(archivo) !== archivo) {
    return res.sendStatus(400);
  }

  const extension = path.extname(archivo).toLowerCase();

  if (!extensionesPermitidas.has(extension)) {
    return next();
  }

  const rutaArchivo = path.join(BASE, archivo);

  if (!fs.existsSync(rutaArchivo)) {
    return res.sendStatus(404);
  }

  res.sendFile(rutaArchivo);
});

// Configuración de las fotografías
const almacenamiento = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, CARPETA_FOTOS);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const nombreSeguro = `${Date.now()}-${crypto.randomUUID()}${extension}`;

    callback(null, nombreSeguro);
  }
});

// Formatos permitidos
const extensionesImagen = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp"
]);

const subirFotos = multer({
  storage: almacenamiento,

  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024
  },

  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!extensionesImagen.has(extension)) {
      return callback(
        new Error("Solo se permiten imágenes JPG, JPEG, PNG o WEBP.")
      );
    }

    if (!file.mimetype.startsWith("image/")) {
      return callback(new Error("El archivo seleccionado no es una imagen válida."));
    }

    callback(null, true);
  }
});

// Recibir fotografías y dedicatorias
app.post("/guardar", (req, res) => {
  subirFotos.array("fotos", 10)(req, res, (error) => {
    if (error) {
      let mensaje = error.message || "No fue posible procesar los archivos.";

      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          mensaje = "Cada fotografía debe pesar máximo 10 MB.";
        } else if (error.code === "LIMIT_FILE_COUNT") {
          mensaje = "Puedes subir un máximo de 10 fotografías.";
        } else if (error.code === "LIMIT_UNEXPECTED_FILE") {
          mensaje = "Revisa el campo de selección de fotografías.";
        }
      }

      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>No se pudo guardar</title>
        </head>
        <body style="font-family:Arial,sans-serif;text-align:center;padding:40px;background:#f8f2ec;color:#604940">
          <h1>No se pudo guardar</h1>
          <p>${escapeHTML(mensaje)}</p>
          <a href="/fotos.html">Volver al formulario</a>
        </body>
        </html>
      `);
    }

    const nombre = String(req.body.nombre || "").trim();
    const mensaje = String(req.body.mensaje || "").trim();
    const archivos = req.files || [];

    // Validar la información
    if (!nombre || nombre.length > 100) {
      eliminarArchivos(archivos);

      return res.status(400).send(
        paginaError("Escribe tu nombre. Debe tener máximo 100 caracteres.")
      );
    }

    if (!mensaje || mensaje.length > 2000) {
      eliminarArchivos(archivos);

      return res.status(400).send(
        paginaError("Escribe tu dedicatoria. Debe tener máximo 2000 caracteres.")
      );
    }

    if (archivos.length === 0) {
      return res.status(400).send(
        paginaError("Selecciona al menos una fotografía.")
      );
    }

    // Guardar la dedicatoria en un archivo de texto
    const fecha = new Date().toLocaleString("es-MX", {
      timeZone: "America/Mexico_City"
    });

    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const archivoDedicatoria = path.join(
      CARPETA_DEDICATORIAS,
      `${id}.txt`
    );

    const contenido = [
      `Nombre: ${nombre}`,
      `Fecha: ${fecha}`,
      "",
      "Dedicatoria:",
      mensaje,
      "",
      "Fotografías:",
      ...archivos.map((archivo) => archivo.filename),
      ""
    ].join("\n");

    try {
      fs.writeFileSync(archivoDedicatoria, contenido, {
        encoding: "utf8",
        flag: "wx"
      });
    } catch (errorEscritura) {
      eliminarArchivos(archivos);

      console.error("Error guardando la dedicatoria:", errorEscritura);

      return res.status(500).send(
        paginaError("No fue posible guardar tu dedicatoria. Inténtalo nuevamente.")
      );
    }

    // Agradecimiento después de guardar
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>¡Gracias por compartir!</title>
      </head>
      <body style="margin:0;font-family:Arial,sans-serif;text-align:center;padding:40px 20px;background:#f8f2ec;color:#604940">
        <main style="max-width:600px;margin:40px auto;background:#fffaf5;padding:35px 25px;border-radius:18px">
          <h1>¡Gracias por compartir tus recuerdos!</h1>
          <p>Tu fotografía y dedicatoria se recibieron correctamente.</p>
          <p>Gracias por acompañar a Mónica Yamilet y Luis Enrique en un día tan especial.</p>
          <p>Con cariño, los novios.</p>
          <a href="/" style="display:inline-block;margin-top:20px;padding:12px 22px;background:#7b5e57;color:white;text-decoration:none;border-radius:8px">
            Volver a la invitación
          </a>
        </main>
      </body>
      </html>
    `);
  });
});

// Escapar texto para evitar insertar HTML en las respuestas
function escapeHTML(texto) {
  return String(texto).replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caracter]);
}

function paginaError(mensaje) {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Revisa tus datos</title>
    </head>
    <body style="font-family:Arial,sans-serif;text-align:center;padding:40px;background:#f8f2ec;color:#604940">
      <h1>Revisa tus datos</h1>
      <p>${escapeHTML(mensaje)}</p>
      <a href="/fotos.html">Volver al formulario</a>
    </body>
    </html>
  `;
}

function eliminarArchivos(archivos) {
  for (const archivo of archivos) {
    try {
      fs.unlinkSync(archivo.path);
    } catch (error) {
      console.error("No se pudo eliminar un archivo temporal:", error);
    }
  }
}

// Página no encontrada
app.use((req, res) => {
  res.status(404).send("Página no encontrada.");
});

// Errores inesperados
app.use((error, req, res, next) => {
  console.error("Error del servidor:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).send("Ocurrió un error interno. Inténtalo nuevamente.");
});

// Escuchar conexiones externas en Render
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});
