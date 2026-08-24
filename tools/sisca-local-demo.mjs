import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.SISCA_LOCAL_DEMO_PORT ?? "8010");
const validatedCurp = (process.env.SISCA_LOCAL_VALIDATED_CURP ?? "UXVL900102MDFMRS02")
  .trim()
  .toUpperCase();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, { status: "ok", adapter: "local-demo" });
  }
  if (request.method !== "POST" || url.pathname !== "/validations") {
    return sendJson(response, 404, { error: "not_found" });
  }

  const payload = await readJson(request);
  const curp = typeof payload?.curp === "string" ? payload.curp.trim().toUpperCase() : "";
  if (curp !== validatedCurp) {
    return sendJson(response, 200, {
      success: true,
      codigo: "SIN_INFORMACION",
      mensaje: "Sin información para el caso sintético",
      data: null,
    });
  }

  return sendJson(response, 200, {
    success: true,
    codigo: "OK",
    mensaje: "Caso sintético validado",
    data: {
      tipo_movimiento: "Traspaso NAP",
      estatus: "ACEPTADA PROCESAR",
      fecha_traspaso: "24/08/2026",
    },
  });
});

server.listen(port, host, () => {
  console.log(`SISCA local demo listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}
