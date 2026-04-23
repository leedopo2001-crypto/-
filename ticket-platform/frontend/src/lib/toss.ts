// Minimal wrapper around the Toss Payments browser SDK.
// The SDK is loaded lazily from the CDN on first use.

const SDK_URL = 'https://js.tosspayments.com/v1/payment';

interface TossPayments {
  requestPayment(
    method: string,
    options: {
      amount: number;
      orderId: string;
      orderName: string;
      customerName?: string;
      successUrl: string;
      failUrl: string;
    },
  ): Promise<void>;
}

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => TossPayments;
  }
}

let loaderPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.TossPayments) return Promise.resolve();
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('toss sdk load failed')));
  });
  return loaderPromise;
}

export async function requestTossPayment(opts: {
  clientKey: string;
  method?: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerName?: string;
  successUrl: string;
  failUrl: string;
}): Promise<void> {
  await loadSdk();
  if (!window.TossPayments) throw new Error('TossPayments sdk missing after load');
  const tp = window.TossPayments(opts.clientKey);
  await tp.requestPayment(opts.method ?? '카드', {
    amount: opts.amount,
    orderId: opts.orderId,
    orderName: opts.orderName,
    customerName: opts.customerName,
    successUrl: opts.successUrl,
    failUrl: opts.failUrl,
  });
}
