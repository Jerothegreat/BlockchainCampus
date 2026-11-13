import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import mint from "./routes/mint.js";
import settle from "./routes/settle.js";
import students from "./routes/students.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.webOrigins });

app.get("/health", async () => ({ status: "ok", chainId: config.chainId, contract: config.contract }));
await app.register(students);
await app.register(settle);
await app.register(mint);

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
