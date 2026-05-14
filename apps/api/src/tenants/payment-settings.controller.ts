import { Body, Controller, ForbiddenException, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthRequest } from "../auth/auth.guard";
import { PermissionGuard } from "../auth/auth.guard";
import { PaymentSettingsService } from "./payment-settings.service";

interface PutPaymentSettingsBody {
  paystackEnabled: boolean;
  channelsMomo: boolean;
  channelsCard: boolean;
  minPartialAmountGhs: string;
  paystackPublicKey?: string | null;
  paystackSecretKey?: string | null;
  paystackWebhookSecret?: string | null;
  idempotencyKey: string;
}

@Controller("tenants/:tenantId/payment-settings")
export class PaymentSettingsController {
  constructor(
    private readonly svc: PaymentSettingsService,
    private readonly audit: AuditService
  ) {}

  private assertTenant(req: AuthRequest, tenantId: string) {
    if (req.auth?.tenantId !== tenantId) throw new ForbiddenException("Forbidden");
  }

  @Get()
  @UseGuards(new PermissionGuard("SETTINGS.PAYMENTS.VIEW"))
  async get(@Param("tenantId") tenantId: string, @Req() req: AuthRequest) {
    this.assertTenant(req, tenantId);
    return this.svc.getPublic(tenantId);
  }

  @Put()
  @UseGuards(new PermissionGuard("SETTINGS.PAYMENTS.EDIT"))
  async put(
    @Param("tenantId") tenantId: string,
    @Req() req: AuthRequest,
    @Body() body: PutPaymentSettingsBody
  ) {
    this.assertTenant(req, tenantId);
    const { idempotencyKey, ...rest } = body;

    await this.svc.upsert({ tenantId, ...rest });
    await this.audit.write({
      tenantId,
      branchId: req.auth?.branchId ?? null,
      actorUserId: req.auth?.userId ?? "unknown",
      action: "TENANT_PAYMENT_SETTINGS.UPDATE",
      entityType: "TenantPaymentSettings",
      entityId: tenantId,
      idempotencyKey,
      requestId: req.auth?.requestId ?? "unknown",
      occurredAt: new Date().toISOString(),
      metadata: {
        paystackEnabled: body.paystackEnabled,
        channelsMomo: body.channelsMomo,
        channelsCard: body.channelsCard,
        minPartialAmountGhs: body.minPartialAmountGhs,
        paystackPublicKeySet: Boolean(body.paystackPublicKey),
        paystackSecretKeyReplaced: body.paystackSecretKey != null,
        paystackWebhookSecretReplaced: body.paystackWebhookSecret != null
      }
    });

    return this.svc.getPublic(tenantId);
  }
}

