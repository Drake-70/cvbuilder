import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-surface-900 mb-2">Terms and Conditions</h1>
          <p className="text-sm text-surface-400 mb-8">Last updated: July 26, 2026</p>

          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">1. Acceptance of Terms</h2>
              <p className="text-surface-600 leading-relaxed">
                By accessing or using CVBoost (&quot;the Service&quot;), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use the Service. CVBoost reserves the right to modify these terms at any time, and continued use of the Service constitutes acceptance of any changes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">2. Description of Service</h2>
              <p className="text-surface-600 leading-relaxed">
                CVBoost provides an AI-powered platform for creating, tailoring, and downloading curriculum vitae (CV) documents and cover letters. The Service allows users to upload or build CVs, tailor them to specific job descriptions using artificial intelligence, and download the results as Word (.docx) documents.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">3. User Accounts</h2>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>You must be at least 16 years old to create an account.</li>
                <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                <li>You agree to provide accurate and complete information when creating your account.</li>
                <li>You are responsible for all activity that occurs under your account.</li>
                <li>You must notify CVBoost immediately of any unauthorized use of your account.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">4. Payment Terms</h2>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>CVBoost offers both one-time payment and subscription-based pricing.</li>
                <li>All payments are processed through CamPay (MTN Mobile Money and Orange Money).</li>
                <li>Prices are displayed in Central African CFA Franc (XAF).</li>
                <li>Subscription plans renew automatically at the end of each billing period unless cancelled.</li>
                <li>Refunds may be issued within 7 days of purchase if the Service was not used. Contact support for refund requests.</li>
                <li>CVBoost reserves the right to modify pricing with 30 days&apos; notice to subscribers.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">5. User Content</h2>
              <p className="text-surface-600 leading-relaxed mb-3">
                You retain full ownership of all content you upload or input into CVBoost, including your CV text, personal information, and job descriptions. By using the Service, you grant CVBoost a limited, non-exclusive license to process your content solely for the purpose of providing the Service.
              </p>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>CVBoost does not claim ownership of your CV content or any generated outputs.</li>
                <li>You may delete your content at any time from your dashboard.</li>
                <li>Deleted content is permanently removed from our systems within 30 days.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">6. AI-Generated Content</h2>
              <p className="text-surface-600 leading-relaxed">
                CVBoost uses artificial intelligence (LLaMA 3.1 via Groq) to tailor your CV content. While we strive for accuracy, AI-generated content may contain errors or inaccuracies. You are responsible for reviewing and verifying all AI-generated content before using it in job applications. CVBoost does not guarantee that AI-generated content will be factually accurate or free of errors.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">7. Acceptable Use</h2>
              <p className="text-surface-600 leading-relaxed mb-3">You agree not to:</p>
              <ul className="list-disc pl-5 space-y-2 text-surface-600 leading-relaxed">
                <li>Use the Service for any unlawful purpose or in violation of any applicable laws.</li>
                <li>Attempt to gain unauthorized access to any part of the Service or its systems.</li>
                <li>Use automated tools (bots, scrapers) to access or interact with the Service.</li>
                <li>Resell, sublicense, or redistribute CVBoost&apos;s output without authorization.</li>
                <li>Upload malicious content, viruses, or any harmful code.</li>
                <li>Impersonate another person or entity.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">8. Intellectual Property</h2>
              <p className="text-surface-600 leading-relaxed">
                All intellectual property rights in the Service itself, including its software, design, branding, logos, and documentation, are owned by CVBoost. These Terms do not grant you any rights to use CVBoost&apos;s trademarks, logos, or brand names without prior written consent.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">9. Limitation of Liability</h2>
              <p className="text-surface-600 leading-relaxed">
                To the maximum extent permitted by law, CVBoost shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of the Service. CVBoost&apos;s total liability shall not exceed the amount you paid for the Service in the 12 months preceding the claim.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">10. Termination</h2>
              <p className="text-surface-600 leading-relaxed">
                CVBoost may suspend or terminate your account at any time for violation of these Terms or for any other reasonable cause. Upon termination, your right to use the Service ceases immediately. You may also delete your account at any time from your dashboard settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">11. Governing Law</h2>
              <p className="text-surface-600 leading-relaxed">
                These Terms are governed by and construed in accordance with the laws of the Republic of Cameroon. Any disputes arising under these Terms shall be resolved in the competent courts of Douala, Cameroon.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">12. Changes to Terms</h2>
              <p className="text-surface-600 leading-relaxed">
                CVBoost reserves the right to update these Terms at any time. Material changes will be communicated via email or a prominent notice on the Service. Your continued use of the Service after changes take effect constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-surface-900 mb-3">13. Contact</h2>
              <p className="text-surface-600 leading-relaxed">
                For questions about these Terms, please contact us at{' '}
                <a href="mailto:legal@cvboost.cm" className="text-brand-600 hover:text-brand-700">legal@cvboost.cm</a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
