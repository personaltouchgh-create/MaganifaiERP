import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [HealthModule],
  providers: [{ provide: "APP_NAME", useValue: "api" }]
})
export class AppModule {
  public readonly appName = "api";
}
