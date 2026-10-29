import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 py-12 max-w-4xl">
        <Link to="/">
          <Button variant="ghost" className="mb-8 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-10">Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>

        <div className="prose prose-invert max-w-none space-y-8 text-foreground">
          <section>
            <h2 className="text-2xl font-semibold mb-3">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              AI Hidden Leads ("we," "us," or "our") operates the website aihiddenleads.com and provides AI-powered lead generation, voice agent, chat widget, and business automation services. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">2. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">We may collect the following types of information:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong className="text-foreground">Personal Information:</strong> Name, email address, phone number, business name, and website URL provided through our forms.</li>
              <li><strong className="text-foreground">Business Information:</strong> Publicly available business data including website content, contact details, ratings, and social media profiles obtained through our lead generation services.</li>
              <li><strong className="text-foreground">Usage Data:</strong> Browser type, IP address, pages visited, time spent on pages, and other analytics data.</li>
              <li><strong className="text-foreground">Communication Data:</strong> Records of calls, SMS messages, emails, and chat interactions processed through our platform.</li>
              <li><strong className="text-foreground">Assistant conversations:</strong> After the recording notice and your agreement, voice audio, voice/chat transcripts and AI summaries are stored privately for authorized review and service quality. You may decline by not starting. Recording agreement is not marketing or model-training consent. A requested transcript/summary email uses a private link valid for seven days; anyone with that link can read the copy. Audio is not included in that visitor link. Contact info@aihiddenleads.com for access or deletion requests.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">3. SMS/Text Messaging Consent & Policy</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              By providing your phone number and opting in to our services, you consent to receive SMS/text messages from AI Hidden Leads. These messages may include:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Service notifications and updates</li>
              <li>AI demo links and personalized business previews</li>
              <li>Appointment confirmations and reminders</li>
              <li>Lead alerts and engagement notifications</li>
              <li>Marketing and promotional messages about our services</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              <strong className="text-foreground">Message Frequency:</strong> Message frequency varies based on your engagement and service usage. Typically 1-10 messages per month.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Opt-Out:</strong> You may opt out of SMS messages at any time by replying STOP to any message. After opting out, you will receive one final confirmation message. You may also contact us at support@aihiddenleads.com to opt out.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Opt-In:</strong> You may re-subscribe at any time by replying START or by contacting us.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Costs:</strong> Message and data rates may apply. Check with your mobile carrier for details.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Help:</strong> For help, reply HELP to any message or contact support@aihiddenleads.com.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell, rent, or share your phone number or SMS opt-in consent with third parties for their marketing purposes. Consent is not a condition of purchase.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">4. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>To provide and maintain our AI voice agent, chat widget, and lead generation services</li>
              <li>To generate personalized AI demos for your business</li>
              <li>To send service-related communications via email, SMS, and phone</li>
              <li>To improve our services and develop new features</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">5. Data Sharing & Disclosure</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell your personal information. We may share data with trusted service providers who assist in operating our platform (e.g., cloud hosting, communication APIs, analytics) under strict confidentiality agreements. We may also disclose information when required by law or to protect our rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">6. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement industry-standard security measures to protect your information, including encryption in transit and at rest, secure cloud infrastructure, and access controls. However, no method of transmission over the Internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">7. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your personal information for as long as necessary to provide our services and fulfill the purposes described in this policy. You may request deletion of your data at any time by contacting support@aihiddenleads.com.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">8. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to access, correct, or delete your personal information. You may also opt out of marketing communications at any time. To exercise these rights, contact us at support@aihiddenleads.com.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3">9. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about this Privacy Policy, please contact us at:<br />
              <strong className="text-foreground">Email:</strong> support@aihiddenleads.com<br />
              <strong className="text-foreground">Website:</strong> aihiddenleads.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
