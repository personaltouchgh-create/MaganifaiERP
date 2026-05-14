import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module";
import { DbModule } from "./db/db.module";
import { HealthModule } from "./health/health.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { PaymentsModule } from "./payments/payments.module";
import { TenantsModule } from "./tenants/tenants.module";

@Module({
  imports: [DbModule, HealthModule, AuditModule, TenantsModule, InvoicesModule, PaymentsModule],
  providers: [{ provide: "APP_NAME", useValue: "api" }]
})
export class AppModule {
  public readonly appName = "api";
}
