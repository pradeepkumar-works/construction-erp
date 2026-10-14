'use client';

import type { BillingOrderDto } from '@erp/shared';
import { PRODUCT_NAME } from '@erp/shared';
import { BRAND } from './brand';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface CheckoutResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface CheckoutInstance {
  open(): void;
  on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void;
}
type CheckoutCtor = new (options: Record<string, unknown>) => CheckoutInstance;

function loadCheckout(): Promise<CheckoutCtor> {
  const w = window as unknown as { Razorpay?: CheckoutCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Razorpay Checkout did not load')));
    s.onerror = () => reject(new Error('Could not load Razorpay Checkout. Check the connection and try again.'));
    document.body.appendChild(s);
  });
}

export interface PaidResult {
  orderId: string;
  paymentId: string;
  signature: string;
}

/** Opens Razorpay Checkout for an order. Resolves with what the API verifies, or null if the payer closed it. */
export async function payWithRazorpay(order: BillingOrderDto): Promise<PaidResult | null> {
  const Razorpay = await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: PRODUCT_NAME,
      description: order.description,
      prefill: order.prefill,
      theme: { color: BRAND.colors.accent },
      handler: (r: CheckoutResponse) => resolve({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r.error?.description ?? 'The payment failed')));
    rzp.open();
  });
}
