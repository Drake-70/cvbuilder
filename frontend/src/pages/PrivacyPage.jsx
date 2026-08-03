import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function PrivacyPage() {
  const { t } = useTranslation('common');

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 no-underline mb-8">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
          {t('home')}
        </Link>

        <div className="prose-content">
          <h1 className="text-3xl font-bold text-surface-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-surface-400 mb-8">Last updated: July 26, 2026</p>

          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">1. Introduction</h2>
              <p className="text-surface-600 leading-relaxed">
                CVBoost (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI-powered CV tailoring platform. By using CVBoost, you agree to the collection and use of information in accordance with this policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">2. Information We Collect</h2>

              <h3 className="text-lg font-semibold text-surface-800 mb-2 mt-4">2.1 Account Information</h3>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>Email address</li>
                <li>Full name</li>
                <li>Password (stored as a bcrypt hash — we never store plain-text passwords)</li>
                <li>Preferred language (English or French)</li>
                <li>Subscription status and payment history</li>
              </ul>

              <h3 className="text-lg font-semibold text-surface-800 mb-2 mt-4">2.2 CV Content</h3>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>CV text you upload or paste</li>
                <li>CV content you build through our questionnaire</li>
                <li>Job descriptions you submit for tailoring</li>
                <li>AI-tailored CV output, cover letters, and gap analyses</li>
                <li>Uploaded images of job postings (temporarily processed and not stored long-term)</li>
              </ul>

              <h3 className="text-lg font-semibold text-surface-800 mb-2 mt-4">2.3 Usage and Technical Data</h3>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>IP address (anonymized after 30 days)</li>
                <li>Browser type and version</li>
                <li>Device type and screen resolution</li>
                <li>Pages visited and actions taken within the Service</li>
                <li>Referring website or source</li>
              </ul>

              <h3 className="text-lg font-semibold text-surface-800 mb-2 mt-4">2.4 Payment Data</h3>
              <p className="text-surface-600 leading-relaxed">
                Payment transactions are processed by CamPay (MTN Mobile Money / Orange Money). CVBoost does not store your mobile money PIN, full phone number, or any payment credentials on our servers. We only retain the transaction reference, amount, and status for account management purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li><strong>Service delivery:</strong> To process your CV content, run AI tailoring, and generate downloads.</li>
                <li><strong>Account management:</strong> To create and maintain your account, track subscriptions, and provide customer support.</li>
                <li><strong>Service improvement:</strong> To analyze anonymized usage patterns and improve the platform.</li>
                <li><strong>Security:</strong> To detect and prevent fraud, abuse, and unauthorized access.</li>
                <li><strong>Communication:</strong> To send you important account-related emails (e.g., password resets, subscription confirmations). We do not send marketing emails without your explicit consent.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">4. AI Processing</h2>
              <p className="text-surface-600 leading-relaxed mb-3">
                Your CV content is sent to our AI provider (Groq, running LLaMA 3.1) for processing when you use the tailoring feature. This data is processed in real-time and is not used to train AI models. Groq&apos;s API processes data in compliance with their privacy policy, and data in transit is encrypted via TLS.
              </p>
              <p className="text-surface-600 leading-relaxed">
                We do not share your CV content with any third party for marketing, profiling, or any purpose other than providing the Service to you.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">5. Data Storage and Security</h2>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>Your data is stored in MongoDB Atlas cloud databases with encryption at rest.</li>
                <li>All data in transit is encrypted using TLS 1.3.</li>
                <li>Authentication uses HTTP-only secure cookies with short-lived access tokens (15 minutes) and refresh tokens (7 days).</li>
                <li>Passwords are hashed using bcrypt with 12 salt rounds.</li>
                <li>We implement rate limiting, input sanitization, and security headers to protect against common attacks.</li>
                <li>Access to production databases is restricted to authorized personnel only.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">6. Data Retention</h2>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li><strong>Account data:</strong> Retained as long as your account is active. Deleted within 30 days of account deletion.</li>
                <li><strong>CV content:</strong> Retained until you manually delete it from your dashboard or delete your account.</li>
                <li><strong>Payment records:</strong> Retained for 5 years for legal and accounting compliance.</li>
                <li><strong>Usage logs:</strong> Anonymized after 30 days; fully purged after 90 days.</li>
                <li><strong>Uploaded images:</strong> Processed in real-time and deleted immediately after text extraction.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">7. Your Rights</h2>
              <p className="text-surface-600 leading-relaxed mb-3">You have the right to:</p>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li><strong>Access:</strong> Request a copy of all personal data we hold about you.</li>
                <li><strong>Rectification:</strong> Request correction of inaccurate personal data.</li>
                <li><strong>Deletion:</strong> Request deletion of your personal data and account.</li>
                <li><strong>Data portability:</strong> Request your data in a machine-readable format.</li>
                <li><strong>Withdraw consent:</strong> Opt out of any non-essential data processing at any time.</li>
              </ul>
              <p className="text-surface-600 leading-relaxed mt-3">
                To exercise these rights, contact us at{' '}
                <a href="mailto:privacy@cvboost.cm" className="text-brand-600 hover:text-brand-700">privacy@cvboost.cm</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">8. Third-Party Services</h2>
              <p className="text-surface-600 leading-relaxed mb-3">We use the following third-party services:</p>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li><strong>MongoDB Atlas</strong> — Cloud database hosting</li>
                <li><strong>Groq</strong> — AI inference for CV tailoring (LLaMA 3.1)</li>
                <li><strong>CamPay</strong> — Mobile money payment processing (MTN / Orange)</li>
              </ul>
              <p className="text-surface-600 leading-relaxed mt-3">
                Each third-party service processes data in accordance with their own privacy policies. We encourage you to review their policies for more information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">9. Cookies</h2>
              <p className="text-surface-600 leading-relaxed">
                CVBoost uses essential HTTP-only cookies for authentication (access and refresh tokens). We do not use advertising cookies or third-party ad tracking. When enabled, we use privacy-respecting, self-hosted-style analytics (PostHog) that stores a random identifier in your browser&apos;s localStorage — never in cookies — solely to understand aggregate product usage. Your language and theme preferences are also stored in localStorage, not in cookies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">10. Children&apos;s Privacy</h2>
              <p className="text-surface-600 leading-relaxed">
                CVBoost is not intended for users under the age of 16. We do not knowingly collect personal information from children. If we become aware that a child has provided us with personal information, we will take steps to delete it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">11. Changes to This Policy</h2>
              <p className="text-surface-600 leading-relaxed">
                We may update this Privacy Policy from time to time. Material changes will be communicated via email or a prominent notice on the Service. We encourage you to review this page periodically for the latest information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">12. Contact Us</h2>
              <p className="text-surface-600 leading-relaxed">
                For questions or concerns about this Privacy Policy, please contact us at{' '}
                <a href="mailto:privacy@cvboost.cm" className="text-brand-600 hover:text-brand-700">privacy@cvboost.cm</a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
