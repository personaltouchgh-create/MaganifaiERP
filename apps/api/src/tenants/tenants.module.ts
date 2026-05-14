import { Module } from "@nestjs/common";
import { PaymentSettingsController } from "./payment-settings.controller";
import { PaymentSettingsService } from "./payment-settings.service";

@Module({
  controllers: [PaymentSettingsController],
  providers: [PaymentSettingsService]
})
export class TenantsModule {}

