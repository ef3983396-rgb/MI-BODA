
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

// Render asigna el puerto automáticamente.
const PORT = process.env.PORT || 3000;
const BASE = __dirname;

// Carpetas locales para fotografías y dedicatorias.
const CARPETA_FOTOS = path.join(BASE, "fotos");
const CARPETA_DEDICATORIAS = path.join(BASE, "dedicatorias");

fs.mkdirSync(CARPETA_FOTOS, { recursive: true });
fs.mkdirSync(CARPETA_DEDICATORIAS, { recursive: true });

app.use(express.urlencoded({
  extended: false,
  limit: "100kb"
}));

// Escapar texto para evitar que una dedicatoria
// se interprete como código HTML.
function escaparHTML(texto) {
  return String(texto).replace(/[&<>"']/g, caracter => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[caracter]));
}

// Página del formulario.
app.get("/", (req, res) => {
  res.redirect("/fotos.html");
});

app.get("/fotos.html", (req, res) => {
  res.sendFile(path.join(BASE, "fotos.html"), error => {
    if (error && !res.headersSent) {
      res.status(404).send(
        "No se encontró fotos.html. Verifica que esté junto a servidor.js."
      );
    }
  });
});

// Tipos de imagen permitidos.
const extensionesPermitidas = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp"
]);

const tiposPermitidos = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

// Almacenamiento local temporal.
const almacenamiento = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, CARPETA_FOTOS);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const nombre = Date.now() + "-" +
      crypto.randomUUID() + extension;

    callback(null, nombre);
  }
});

const subirFotos = multer({
  storage: almacenamiento,

  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024,
    fields: 2,
    fieldSize: 10 * 1024
  },

  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (
      extensionesPermitidas.has(extension) &&
      tiposPermitidos.has(file.mimetype)
    ) {
      return callback(null, true);
    }

    callback(new Error(
      "Solo se permiten fotografías JPG, PNG o WEBP."
    ));
  }
});

// Recibir fotografías y dedicatorias.
app.post("/guardar", (req, res) => {
  subirFotos.array("fotos", 10)(req, res, async error => {

    if (error) {
      let mensaje = "No se pudo completar el envío.";

      if (error.code === "LIMIT_FILE_SIZE") {
        mensaje = "Cada fotografía debe pesar como máximo 10 MB.";
      } else if (error.code === "LIMIT_FILE_COUNT") {
        mensaje = "Puedes seleccionar un máximo de 10 fotografías.";
      } else if (error.code === "LIMIT_UNEXPECTED_FILE") {
        mensaje = "El formulario contiene un campo inesperado.";
      } else if (error.code === "LIMIT_FIELD_VALUE" ||
                 error.code === "LIMIT_FIELD_COUNT") {
        mensaje = "El formulario supera los límites permitidos.";
      } else if (error.message) {
        mensaje = error.message;
      }

      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Error al guardar</title>
        </head>
        <body style="
          margin:0;padding:35px 20px;background:#f8f2ec;
          color:#604940;font-family:Georgia,serif;text-align:center">
          <main style="
            max-width:480px;margin:40px auto;padding:35px 25px;
            background:#fffdf9;border:1px solid #ddc9b8;border-radius:10px">
            <h1>No se pudieron guardar tus recuerdos</h1>
            <p style="line-height:1.8">${escaparHTML(mensaje)}</p>
            <a href="/fotos.html" style="color:#7b5e57">
              Volver al formulario
            </a>
          </main>
        </body>
        </html>
      `);
    }

    const archivos = req.files || [];
    let rutaDedicatoria = null;

    try {
      const nombre = String(req.body.nombre || "").trim();
      const mensaje = String(req.body.mensaje || "").trim();

      if (!nombre || nombre.length > 100) {
        throw new Error(
          "Escribe tu nombre. Debe tener entre 1 y 100 caracteres."
        );
      }

      if (!mensaje || mensaje.length > 2000) {
        throw new Error(
          "Escribe una dedicatoria de hasta 2000 caracteres."
        );
      }

      if (archivos.length === 0) {
        throw new Error(
          "Selecciona al menos una fotografía para compartir."
        );
      }

      const id = Date.now() + "-" + crypto.randomUUID();

      const fecha = new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City"
      });

      const contenido = [
        "RECUERDOS DE LA BODA",
        "====================",
        "",
        "Nombre: " + nombre,
        "Fecha de recepción: " + fecha,
        "",
        "DEDICATORIA",
        "-----------",
        mensaje,
        "",
        "FOTOGRAFÍAS",
        "-----------",
        ...archivos.map((archivo, indice) =>
          `${indice + 1}. ${archivo.filename}`
        ),
        "",
        "Número de fotografías: " + archivos.length
      ].join("\n");

      rutaDedicatoria = path.join(
        CARPETA_DEDICATORIAS,
        id + ".txt"
      );

      await fs.promises.writeFile(
        rutaDedicatoria,
        contenido,
        { encoding: "utf8", flag: "wx" }
      );

      // Agradecimiento al invitado.
      return res.status(200).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Gracias por compartir tus recuerdos</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Montserrat:wght@400;500&display=swap" rel="stylesheet">
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0; min-height: 100vh; padding: 25px 15px;
              display: flex; align-items: center; justify-content: center;
              background: #f8f2ec; color: #604940;
              font-family: 'Montserrat', Arial, sans-serif;
            }
            main {
              position: relative; width: 100%; max-width: 560px;
              padding: 45px 35px; background: #fffdf9;
              border: 1px solid #ddc9b8; border-radius: 8px;
              box-shadow: 0 8px 30px #60494012;
              text-align: center; overflow: hidden;
            }
            .linea {
              position: absolute; top: 0; left: 0;
              width: 100%; height: 5px;
              background: linear-gradient(to right,#e9d9cb,#7b5e57,#cdb6a4);
            }
            .corazon { margin-bottom: 12px; color: #a58a7d; font-size: 45px; }
            h1 {
              margin: 0 0 12px; color: #7b5e57;
              font-family: 'Cormorant Garamond', Georgia, serif;
              font-size: 43px; font-weight: 500;
            }
            h2 {
              margin: 0 0 20px; color: #604940;
              font-family: 'Cormorant Garamond', Georgia, serif;
              font-size: 29px; font-weight: 400;
            }
            p { font-size: 13px; line-height: 2; }
            .firma {
              margin-top: 25px; color: #7b5e57;
              font-family: 'Cormorant Garamond', Georgia, serif;
              font-size: 25px;
            }
            a {
              display: inline-block; margin-top: 18px;
              padding: 13px 22px; border-radius: 3px;
              background: #7b5e57; color: white;
              font-size: 11px; letter-spacing: 1px; text-decoration: none;
            }
            a:hover { background: #604940; }
            @media (max-width: 480px) {
              main { padding: 38px 22px; }
              h1 { font-size: 36px; }
            }
          </style>
        </head>
        <body>
          <main>
            <div class="linea"></div>
            <div class="corazon">♡</div>
            <h1>¡Muchas gracias!</h1>
            <h2>${escaparHTML(nombre)}</h2>
            <p>
              Gracias por acompañarnos en un día tan especial.
              Tus fotografías y tus palabras se recibieron correctamente
              y formarán parte de los recuerdos de nuestra boda.
            </p>
            <p class="firma">Con cariño,<br>Mónica y Luis</p>
            <a href="/fotos.html">VOLVER A LOS RECUERDOS</a>
          </main>
        </body>
        </html>
      `);

    } catch (error) {
      console.error("Error al guardar los recuerdos:", error);

      for (const archivo of archivos) {
        try {
          await fs.promises.unlink(archivo.path);
        } catch (errorArchivo) {
          console.error(
            "No se pudo eliminar:",
            archivo.filename,
            errorArchivo.message
          );
        }
      }

      if (rutaDedicatoria) {
        try {
          await fs.promises.unlink(rutaDedicatoria);
        } catch (_) {
          // La dedicatoria puede no haberse creado.
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
        <body style="
          margin:0;padding:40px 20px;background:#f8f2ec;
          color:#604940;font-family:Georgia,serif;text-align:center">
          <main style="
            max-width:480px;margin:35px auto;padding:35px 25px;
            background:#fffdf9;border:1px solid #ddc9b8;border-radius:8px">
            <h1>No se pudo completar el guardado</h1>
            <p style="line-height:1.8">
              ${escaparHTML(error.message || "Ocurrió un error inesperado.")}
            </p>
            <a href="/fotos.html" style="color:#7b5e57">
              Volver al formulario
            </a>
          </main>
        </body>
        </html>
      `);
    }
  });
});

// Ruta sencilla para comprobar que el servidor está activo.
app.get("/salud", (req, res) => {
  res.status(200).json({
    estado: "activo",
    servicio: "Servidor de recuerdos de la boda"
  });
});

// Manejo general de errores.
app.use((error, req, res, next) => {
  console.error("Error del servidor:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).send(
    "Ocurrió un error interno en el servidor."
  );
});

// Render requiere escuchar en 0.0.0.0.
app.listen(PORT, "0.0.0.0", () => {
  console.log("----------------------------------------");
  console.log("Servidor de recuerdos iniciado");
  console.log("Puerto:", PORT);
  console.log("Formulario: /fotos.html");
  console.log("Fotografías:", CARPETA_FOTOS);
  console.log("Dedicatorias:", CARPETA_DEDICATORIAS);
  console.log("----------------------------------------");
});
