// Pricing configuration — adjust these values as needed
module.exports = {
  // Pay-per-document: one tailored CV + cover letter download
  ONE_TIME_AMOUNT: 500, // XAF

  // Monthly subscription: unlimited tailoring + downloads
  SUBSCRIPTION_AMOUNT: 3000, // XAF per month
  SUBSCRIPTION_DURATION_DAYS: 30,

  // Currency
  CURRENCY: 'XAF',

  // CamPay sandbox test amounts (use these in sandbox mode, < 100 XAF)
  SANDBOX_ONE_TIME_AMOUNT: 50,
  SANDBOX_SUBSCRIPTION_AMOUNT: 90,

  // Feature flags
  FREE_PREVIEW_ENABLED: true, // show tailored content on-screen for free
  PAYMENT_REQUIRED_FOR_DOWNLOAD: true // require payment for .docx download
};
