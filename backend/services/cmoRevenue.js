/*!
 * CMO.ai revenue forwarder
 * ------------------------
 * Reports a completed payment to the CMO.ai studio revenue ledger so the
 * studio monitor + finance agents track real money. Fire-and-forget: never
 * throws, so a CMO outage can't break checkout.
 *
 * Usage:
 *   const cmoRevenue = require('../services/cmoRevenue');
 *   await cmoRevenue.report({
 *     product: 'cvboost',
 *     provider: 'campay',        // campay | paystack | stripe | subscription | ad | grant | other
 *     kind: 'payment',           // payment | subscription | donation | grant | ad_revenue
 *     amount: payment.amount,
 *     currency: payment.currency || 'XAF',
 *     status: 'succeeded',       // succeeded | pending | failed | refunded
 *     reference: payment.campayReference || String(payment._id),
 *     customer: payment.email,
 *     detail: payment.type,
 *   });
 *
 * Env: CMO_ENDPOINT (e.g. https://your-cmo-host) and
 *      CMO_REVENUE_KEY (REVENUE_INGEST_KEY from the CMO .env).
 * Missing either → report() is a no-op.
 */
'use strict';

const ENDPOINT = process.env.CMO_ENDPOINT || '';
const KEY = process.env.CMO_REVENUE_KEY || '';

async function report({ product, provider, kind, amount, currency, status, reference, customer, detail } = {}) {
  if (!ENDPOINT || !product || amount === undefined || amount === null) return { skipped: true };
  const url = `${String(ENDPOINT).replace(/\/$/, '')}/api/revenue/${product}${KEY ? `?key=${encodeURIComponent(KEY)}` : ''}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        kind,
        amount: Number(amount),
        currency,
        status: status || 'succeeded',
        reference,
        customer,
        detail,
      }),
    });
    return await res.json().catch(() => ({ ok: res.ok }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { report };
