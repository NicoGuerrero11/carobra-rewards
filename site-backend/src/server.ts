import { createSiteBackendServer } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const server = createSiteBackendServer(config);

server.listen(config.port, config.host, () => {
  const address = server.address();
  if (address && typeof address !== "string") {
    console.log(`Site backend listening on http://${config.host}:${address.port}`);
  }
});
