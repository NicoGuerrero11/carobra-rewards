import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSecureContext, TLSSocket } from "node:tls";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

// A local PostgreSQL-wire peer: TLS negotiation and dummy authentication only.
// No database, external host, or real credential is involved.
test("real pg TLS validates CA, expiry and hostname before sending startup or credentials", { timeout: 30000 }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "carobra-node-tls-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const openssl = (...args: string[]) => execFileSync("openssl", args, { cwd: directory, stdio: "ignore" });
  openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "1", "-subj", "/CN=Ephemeral test CA");
  openssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=localhost");
  writeFileSync(join(directory, "extensions"), "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n");
  writeFileSync(join(directory, "wrong-extensions"), "subjectAltName=DNS:wrong.example\nextendedKeyUsage=serverAuth\n");
  for (const [name, days, extensions] of [["valid", "1", true], ["mismatch", "1", false]] as const) {
    openssl("x509", "-req", "-in", "server.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", `${name}.pem`, "-days", days,
      "-extfile", extensions ? "extensions" : "wrong-extensions");
  }
  writeFileSync(join(directory, "index"), "");
  writeFileSync(join(directory, "serial"), "01\n");
  writeFileSync(join(directory, "ca.conf"), "[ca]\ndefault_ca=test\n[test]\ndatabase=index\nnew_certs_dir=.\ncertificate=ca.pem\nprivate_key=ca.key\nserial=serial\npolicy=policy\n[policy]\ncommonName=supplied\n[leaf]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n");
  openssl("ca", "-batch", "-config", "ca.conf", "-in", "server.csr", "-out", "expired.pem", "-startdate", "20000101000000Z", "-enddate", "20010101000000Z", "-extensions", "leaf", "-md", "sha256");
  const moduleUrl = new URL("../src/database/connection.js", import.meta.url).href;
  const clientCode = `import { createDatabase } from ${JSON.stringify(moduleUrl)};
    const pool = createDatabase(process.env.TLS_TEST_URL);
    pool.options.connectionTimeoutMillis = 2000;
    try { const client = await pool.connect(); client.release(); console.log(JSON.stringify({ok:true})); }
    catch (e) { console.log(JSON.stringify({ok:false,code:e.code,message:e.message})); }
    finally { await pool.end(); }`;

  for (const scenario of ["valid", "valid-dns", "untrusted", "expired", "mismatch", "refuses-tls"] as const) {
    await t.test(scenario, async () => {
      const sockets = new Set<Socket>();
      let startupBytes = 0;
      let passwordReceived = false;
      let plaintextBytes = 0;
      const certificate = scenario === "valid-dns" || scenario === "untrusted" || scenario === "refuses-tls" ? "valid" : scenario;
      const context = createSecureContext({ key: readFileSync(join(directory, "server.key")), cert: readFileSync(join(directory, `${certificate}.pem`)) });
      const server = createServer((socket) => {
        sockets.add(socket);
        socket.on("error", () => {});
        socket.once("data", (request: Buffer) => {
          plaintextBytes += request.length;
          assert.equal(request.readInt32BE(4), 80877103); // SSLRequest, no user/password.
          if (scenario === "refuses-tls") { socket.end("N"); return; }
          socket.write("S");
          const secure = new TLSSocket(socket, { isServer: true, secureContext: context });
          secure.on("error", () => {});
          let started = false;
          secure.on("data", (data: Buffer) => {
            if (!started) {
              startupBytes += data.length;
              started = true;
              secure.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 3])); // cleartext auth, inside TLS
            } else if (data[0] === 112) {
              passwordReceived = data.includes(Buffer.from("tls-test-password"));
              secure.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]));
            }
          });
        });
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const { stdout } = await run(process.execPath, ["--input-type=module", "-e", clientCode], {
          env: { PATH: process.env.PATH, NODE_EXTRA_CA_CERTS: scenario === "untrusted" ? "" : join(directory, "ca.pem"),
            TLS_TEST_URL: `postgresql://tls-test-user:tls-test-password@${scenario === "valid-dns" || scenario === "mismatch" ? "localhost" : "127.0.0.1"}:${address.port}/test?sslmode=verify-full&channel_binding=prefer` },
          timeout: 5000,
        });
        const result = JSON.parse(stdout) as { ok: boolean; code?: string; message?: string };
        assert.equal(plaintextBytes, 8);
        if (scenario === "valid" || scenario === "valid-dns") {
          assert.equal(result.ok, true, result.message);
          assert.ok(startupBytes > 0);
          assert.equal(passwordReceived, true);
        } else {
          assert.equal(result.ok, false);
          if (scenario === "expired") assert.equal(result.code, "CERT_HAS_EXPIRED");
          if (scenario === "mismatch") assert.equal(result.code, "ERR_TLS_CERT_ALTNAME_INVALID");
          if (scenario === "untrusted") assert.match(result.code ?? "", /CERT|ISSUER|SIGNATURE/);
          if (scenario === "refuses-tls") assert.match(result.message ?? "", /does not support SSL/);
          assert.equal(startupBytes, 0, "no startup identity before TLS validation");
          assert.equal(passwordReceived, false, "no password before TLS validation");
        }
      } finally {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  }
});
