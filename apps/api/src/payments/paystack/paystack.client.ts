import { Injectable } from "@nestjs/common";

export interface PaystackInitResponse extends Record<string, string> {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackVerifyResponse {
  reference: string;
  status: string;
  amount: number;
  paid_at: string | null;
  metadata?: unknown;
}

function readBaseUrl() {
  return process.env.PAYSTACK_API_BASE_URL ?? "https://api.paystack.co";
}

@Injectable()
export class PaystackClient {
  constructor(private readonly baseUrl: string = readBaseUrl()) {}

  async initializeTransaction(args: {
    secretKey: string;
    email: string;
    amountPesewas: number;
    callbackUrl: string;
    metadata: Record<string, unknown>;
  }): Promise<PaystackInitResponse> {
    const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: args.email,
        amount: args.amountPesewas,
        callback_url: args.callbackUrl,
        metadata: args.metadata
      })
    });

    const json = (await res.json()) as unknown as { status?: boolean; data?: PaystackInitResponse };
    if (!res.ok || json.status !== true || !json.data) {
      throw new Error(`Paystack initialize failed: ${String(res.status)}`);
    }
    return json.data;
  }

  async verifyTransaction(args: {
    secretKey: string;
    reference: string;
  }): Promise<PaystackVerifyResponse> {
    const res = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(args.reference)}`, {
      headers: {
        Authorization: `Bearer ${args.secretKey}`
      }
    });

    const json = (await res.json()) as unknown as { status?: boolean; data?: PaystackVerifyResponse };
    if (!res.ok || json.status !== true || !json.data) {
      throw new Error(`Paystack verify failed: ${String(res.status)}`);
    }
    return json.data;
  }
}
