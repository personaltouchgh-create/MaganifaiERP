import { Module } from "@nestjs/common";
import { PaystackClient } from "./paystack/paystack.client";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { PaystackWebhookController } from "./webhooks/paystack-webhook.controller";

@Module({
  controllers: [PaymentsController, PaystackWebhookController],
  providers: [PaymentsService, PaystackClient]
})
export class PaymentsModule {}
