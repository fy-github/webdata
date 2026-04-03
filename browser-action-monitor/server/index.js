import { createApp } from "./app.js";
import { getServerConfig } from "./config.js";

const config = getServerConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.log(`Browser Action Monitor server listening on port ${config.port}`);
});
