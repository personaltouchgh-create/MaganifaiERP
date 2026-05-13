import "reflect-metadata";
import cors from "cors";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { corsOrigin } from "./common/cors";
import { rateLimit } from "./common/rate-limit";
import { securityHeaders } from "./common/security-headers";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(securityHeaders);
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true
    })
  );

  app.use("/auth", rateLimit({ windowMs: 60_000, max: 30 }));
  app.use("/payments", rateLimit({ windowMs: 60_000, max: 20 }));

  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
