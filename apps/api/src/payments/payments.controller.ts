import { Body, Controller, ForbiddenException, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.guard";
import { PermissionGuard } from "../auth/auth.guard";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  private requireTenantId(req: AuthRequest) {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) throw new ForbiddenException("Forbidden");
    return tenantId;
  }

  private requireBranchId(req: AuthRequest) {
    const branchId = req.auth?.branchId;
    if (!branchId) throw new ForbiddenException("Missing branch");
    return branchId;
  }

  @Post("intents")
  @UseGuards(new PermissionGuard("PAYMENTS.INTENTS.CREATE"))
  async createIntent(
    @Req() req: AuthRequest,
    @Body()
    body: {
      invoiceId: string;
      amount: string;
      channel: "MOMO" | "CARD";
      idempotencyKey: string;
      email: string;
      callbackUrl: string;
    }
  ) {
    const tenantId = this.requireTenantId(req);
    const branchId = this.requireBranchId(req);
    const userId = req.auth?.userId;
    if (!userId) throw new ForbiddenException("Forbidden");

    return this.svc.createIntent({
      tenantId,
      branchId,
      invoiceId: body.invoiceId,
      amountGhs: body.amount,
      channel: body.channel,
      idempotencyKey: body.idempotencyKey,
      customerEmail: body.email,
      callbackUrl: body.callbackUrl,
      createdByUserId: userId,
      createdFrom: "PORTAL"
    });
  }

  @Post(":intentId/verify")
  @UseGuards(new PermissionGuard("PAYMENTS.INTENTS.CREATE"))
  async verifyIntent(@Req() req: AuthRequest, @Param("intentId") intentId: string) {
    const tenantId = this.requireTenantId(req);
    const branchId = this.requireBranchId(req);
    return this.svc.verifyIntent({ tenantId, branchId, intentId });
  }
}
