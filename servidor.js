
const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = __dirname;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = "fotos-boda";

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// No exponer archivos internos del servidor.
app.use((req, res, next) => {
  const ruta = req.path.toLowerCase();

  if (
    ["/servidor.js", "/package.json", "/package-lock.json"].includes(ruta) ||
    ruta.startsWith("/node_modules/") ||
    ruta.startsWith("/fotos/") ||
    ruta.startsWith("/dedicatorias/")
  ) {
    return res.sendStatus(404);
  }

  next();
});

// Página principal de la invitación.
app.get("/", (req, res) => {
  res.sendFile(path.join(BASE, "Index.html"));
});

// Formulario de recuerdos.
app.get("/fotos.html", (req, res) => {
  res.sendFile(path.join(BASE, "fotos.html"));
});

// Archivos estáticos de la invitación.
app.use(express.static(BASE, {
  index: false,
  dotfiles: "deny"
}));

const extensionesPermitidas = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024,
    fields: 5,
    fieldSize: 10000
  },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!extensionesPermitidas.has(extension)) {
      return callback(
        new Error("Solo se permiten imágenes JPG, JPEG, PNG o WEBP.")
      );
    }

    const tiposPermitidos = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp"
    };

    if (file.mimetype !== tiposPermitidos[extension]) {
      return callback(new Error("El formato de la imagen no es válido."));
    }

    callback(null, true);
  }
});

app.post("/guardar", (req, res) => {
  upload.array("fotos", 10)(req, res, async (error) => {
    if (error) {
      const mensaje =
        error.code === "LIMIT_FILE_SIZE"
          ? "Cada fotografía debe pesar máximo 10 MB."
          : error.code === "LIMIT_FILE_COUNT"
          ? "Puedes subir hasta 10 fotografías."
          : error.message || "No se pudieron procesar los archivos.";

      return res.status(400).send(paginaMensaje(
        "Revisa tus archivos",
        mensaje,
        "/fotos.html"
      ));
    }

    const nombre = String(req.body.nombre || "").trim();
    const mensaje = String(req.body.mensaje || "").trim();
    const archivos = req.files || [];

    if (!nombre || nombre.length > 100) {
      return res.status(400).send(paginaMensaje(
        "Revisa tus datos",
        "Escribe tu nombre (máximo 100 caracteres).",
        "/fotos.html"
      ));
    }

    if (!mensaje || mensaje.length > 2000) {
      return res.status(400).send(paginaMensaje(
        "Revisa tu dedicatoria",
        "Escribe un mensaje de hasta 2000 caracteres.",
        "/fotos.html"
      ));
    }

    if (archivos.length === 0) {
      return res.status(400).send(paginaMensaje(
        "Faltan fotografías",
        "Selecciona al menos una fotografía.",
        "/fotos.html"
      ));
    }

    const rutasSubidas = [];

    try {
      // Subir cada fotografía al bucket privado de Supabase.
      for (const archivo of archivos) {
        const extension = path.extname(archivo.originalname).toLowerCase();
        const ruta = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${extension}`;

        const { error: errorFoto } = await supabase.storage
          .from(BUCKET)
          .upload(ruta, archivo.buffer, {
            contentType: archivo.mimetype,
            upsert: false
          });

        if (errorFoto) {
          throw errorFoto;
        }

        rutasSubidas.push(ruta);
      }

      // Guardar nombre, dedicatoria y rutas en PostgreSQL.
      const { error: errorTabla } = await supabase
        .from("dedicatorias_boda")
        .insert({
          nombre,
          mensaje,
          fotos: rutasSubidas
        });

      if (errorTabla) {
        throw errorTabla;
      }

      return res.status(200).send(paginaMensaje(
        "¡Gracias por compartir tus recuerdos!",
        "Tus fotografías y dedicatoria se guardaron correctamente. Gracias por acompañar a Mónica Yamilet y Luis Enrique en un día tan especial.",
        "/"
      ));

    } catch (errorGuardar) {
      console.error("Error al guardar en Supabase:", errorGuardar);

      // Si falló el registro, intentar retirar las fotos
      // que se subieron durante esta operación.
      if (rutasSubidas.length > 0) {
        const { error: errorLimpieza } = await supabase.storage
          .from(BUCKET)
          .remove(rutasSubidas);

        if (errorLimpieza) {
          console.error("No se pudieron retirar algunas fotos:", errorLimpieza);
        }
      }

      return res.status(500).send(paginaMensaje(
        "No se pudo completar el guardado",
        "Ocurrió un problema al almacenar tus recuerdos. Inténtalo de nuevo. Si persiste, contacta a los novios.",
        "/fotos.html"
      ));
    }
  });
});

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, caracter => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caracter]);
}

function paginaMensaje(titulo, mensaje, enlace) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapar(titulo)}</title>
</head>
<body style="margin:0;padding:35px 20px;background:#f8f2ec;color:#604940;font-family:Arial,sans-serif;text-align:center">
  <main style="max-width:600px;margin:30px auto;padding:30px;background:#fffaf5;border-radius:18px">
    <h1>${escapar(titulo)}</h1>
    <p>${escapar(mensaje)}</p>
    <a href="${escapar(enlace)}" style="display:inline-block;margin-top:20px;padding:12px 22px;background:#7b5e57;color:white;text-decoration:none;border-radius:8px">
      ${enlace === "/" ? "Volver a la invitación" : "Regresar al formulario"}
    </a>
  </main>
</body>
</html>`;
}

app.use((req, res) => {
  res.status(404).send("Página no encontrada.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});
