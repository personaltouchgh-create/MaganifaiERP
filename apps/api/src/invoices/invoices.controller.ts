import { Controller, ForbiddenException, Get, Param, Req, UseGuards } from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.guard";
import { PermissionGuard } from "../auth/auth.guard";
import { InvoicesService } from "./invoices.service";

@Controller()
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) {}

  private requireBranchId(req: AuthRequest) {
    const branchId = req.auth?.branchId;
    if (!branchId) throw new ForbiddenException("Missing branch");
    return branchId;
  }

  @Get("portal/bills")
  @UseGuards(new PermissionGuard("PORTAL.BILLS.VIEW"))
  async getPortalBills(@Req() req: AuthRequest) {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) throw new ForbiddenException("Forbidden");
    const branchId = this.requireBranchId(req);
    return this.svc.getPortalBills({ tenantId, branchId });
  }

  @Get("invoices/:invoiceId/payments")
  @UseGuards(new PermissionGuard("INVOICES.PAYMENTS.VIEW"))
  async getInvoicePayments(@Param("invoiceId") invoiceId: string, @Req() req: AuthRequest) {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) throw new ForbiddenException("Forbidden");
    const branchId = this.requireBranchId(req);
    return this.svc.getInvoicePayments({ tenantId, branchId, invoiceId });
  }
}

