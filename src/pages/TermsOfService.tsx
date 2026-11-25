import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 py-12 max-w-4xl">
        <Link to="/">
          <Button variant="ghost" className="mb-8 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-10">Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>

        <div className="prose prose-invert max-w-none space-y-8 text-foreground">
          <section>
            <h2 className="text-2xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using AI Hidden Leads' website (aihiddenleads.com) and services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">2. Description of Services</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">AI Hidden Leads provides AI-powered business growth services including:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>AI Voice Agents — Automated phone answering, qualification, and warm transfer</li>
              <li>AI Chat Widgets — Website chat assistants trained on your business data</li>
              <li>Lead Generation — Intent-based prospecting and business discovery</li>
              <li>Database Reactivation — AI-powered re-engagement of inactive leads</li>
              <li>Automated Outreach — Multi-channel campaign automation (email, SMS, voice)</li>
              <li>Speed-to-Lead — Real-time engagement response system</li>
              <li>Personalized AI Demos — Instant website previews with embedded AI</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">3. SMS/Text Messaging Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              Texting is optional. If you opt in — by ticking the optional SMS checkbox on our website forms, or by asking us to text you a one-time verification code — you consent to receive SMS/text messages from AI Hidden Leads covering three things: one-time verification codes you request; notifications and alerts about your demo or account (demo links, results, confirmations and reminders); and conversational replies and follow-ups about your demo or account. We do not send marketing blasts by text.
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-3">
              <li><strong className="text-foreground">Frequency:</strong> Message frequency varies; typically 1-10 messages per month.</li>
              <li><strong className="text-foreground">Opt-Out:</strong> Reply STOP to any message to unsubscribe. You will receive a confirmation.</li>
              <li><strong className="text-foreground">Help:</strong> Reply HELP for assistance or contact support@aihiddenleads.com.</li>
              <li><strong className="text-foreground">Costs:</strong> Standard message and data rates may apply per your carrier plan.</li>
              <li><strong className="text-foreground">No Sharing:</strong> We will not sell or share your opt-in information with third parties for marketing purposes.</li>
              <li><strong className="text-foreground">Consent Not Required:</strong> Consent to receive SMS is not a condition of purchasing any service or of using our demo.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">4. User Responsibilities</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>You agree to provide accurate and complete information when using our services.</li>
              <li>You are responsible for maintaining the confidentiality of your account.</li>
              <li>You agree not to use our services for any unlawful or unauthorized purpose.</li>
              <li>You agree to comply with all applicable laws regarding electronic communications.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">5. AI-Generated Content</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our services use artificial intelligence to generate responses, demos, and communications. While we strive for accuracy, AI-generated content may occasionally contain errors. You acknowledge that AI responses do not constitute professional advice and should be reviewed before acting upon.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">6. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              All content, features, and functionality of AI Hidden Leads, including but not limited to text, graphics, logos, and software, are owned by AI Hidden Leads and are protected by intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">7. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              AI Hidden Leads shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use our services. Our total liability shall not exceed the amount paid by you for the services during the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">8. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to terminate or suspend your access to our services at any time, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties. You may also terminate your use of our services at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">9. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. We will notify users of material changes by updating the "Last updated" date. Your continued use of the services after changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">10. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about these Terms, please contact us at:<br />
              <strong className="text-foreground">Email:</strong> support@aihiddenleads.com<br />
              <strong className="text-foreground">Website:</strong> aihiddenleads.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
