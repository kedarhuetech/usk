const lastUpdated = "September 26, 2026";
const appName = "Vyapaar";
const productionDomain = "https://vyapar-ui.vercel.app";
const contactEmail = "Replace with your support email";

function LegalLayout({ title, description, children }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-black uppercase tracking-wide text-blue-600">{appName}</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal text-slate-950">{title}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{description}</p>
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Last Updated: {lastUpdated}</p>
        </header>
        <article className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">{children}</article>
      </div>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
      <div className="mt-2 space-y-2 text-sm font-semibold leading-6 text-slate-600">{children}</div>
    </section>
  );
}

function BulletList({ items }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      description="This policy explains how Vyapaar handles information when you use its business tools and connect third-party services such as Meta."
    >
      <Section title="Introduction">
        <p>
          This policy applies to the Vyapaar application, including Business Growth features such as Smart Ads, Online Store, Marketing Studio, WhatsApp Marketing, and Google Profile Manager. It covers information processed through the application and its backend.
        </p>
      </Section>

      <Section title="Information We Process">
        <BulletList items={[
          "Business profile and contact details, inventory/items, online store settings and orders, campaign settings, designs, templates, and other information you enter or save in Business Growth.",
          "Images and other assets you upload or save for Business Growth features. Uploaded assets are sent to the backend and stored as binary data in MySQL with their file type and related business/entity information.",
          "When you connect Meta, account and business asset information made available by the permissions you grant, such as Meta user details, Pages, business portfolios, ad accounts, and linked Instagram references.",
          "Advertising campaign settings and, when applicable, identifiers and status returned by Meta after a publishing action.",
          "Technical request information needed to operate, secure, and troubleshoot the service, such as API requests and error details.",
        ]} />
      </Section>

      <Section title="Meta/Facebook Integration">
        <p>
          If you choose to connect Meta, Meta's authorization screen describes the permissions requested. The application uses the resulting access to show eligible business assets and support Smart Ads workflows. Meta may process your information under its own policies. Connecting Meta does not mean that Vyapaar has synchronized or published anything unless you take the relevant action in the app.
        </p>
      </Section>

      <Section title="How We Use Information">
        <BulletList items={[
          "To provide and maintain the business tools and features you request.",
          "To save and display your business records, store and order information, designs, uploaded assets, and campaign configurations across sessions.",
          "To connect to third-party services only when you choose to use those integrations, and to carry out the actions you request.",
          "To protect the service, diagnose failures, and respond to support or privacy requests.",
        ]} />
      </Section>

      <Section title="Storage and Business Association">
        <p>
          Business Growth records are stored by the backend in MySQL and associated with the business identifier supplied by the application. Uploaded image assets are also stored in MySQL. Keep your business identifier and account access secure. The current application does not use a separate Vyapaar user login for these Business Growth records, so access control depends on the business context and backend configuration in use.
        </p>
      </Section>

      <Section title="Meta Connection and Tokens">
        <p>
          In the current implementation, Meta connection/session information, including access-token state, is held temporarily by the backend process and is not persisted as a durable MySQL connection record. It may be cleared when the backend restarts. Meta campaign configuration and Business Growth records are stored separately from this temporary connection state.
        </p>
      </Section>

      <Section title="Sharing and Third-Party Services">
        <p>
          We do not sell personal information. Information is shared with a third-party platform when needed to provide an integration or when you ask the application to perform an action there. Meta, Google, WhatsApp/Meta, and hosting or infrastructure providers may process information under their own terms and privacy policies. We do not control their independent processing.
        </p>
      </Section>

      <Section title="Retention and Deletion">
        <p>
          Business Growth data and uploaded assets remain in the configured database until they are deleted through available application functionality or by the database operator. The current temporary Meta connection state is cleared when its backend process loses that state. You may also revoke the application's access from your Meta account settings. For assistance with a privacy or deletion request, use the contact information below; include the business name and relevant record or Meta reference, but do not send passwords, tokens, or secrets.
        </p>
      </Section>

      <Section title="Security">
        <p>
          The backend and database are used to process and store application data. No internet service can guarantee absolute security. You are responsible for protecting access to your device, business context, and any third-party accounts you connect.
        </p>
      </Section>

      <Section title="Your Choices and Rights">
        <p>
          You can choose whether to connect third-party accounts and what information to enter into the application. Depending on where you live, you may have rights to request access, correction, or deletion of personal information. Contact us below to make a request. We may need to verify the request and retain information where required by law or for legitimate service and security needs.
        </p>
      </Section>

      <Section title="Children">
        <p>Vyapaar is a business service and is not intended for children who are not permitted to use it under applicable law.</p>
      </Section>

      <Section title="Changes to This Policy">
        <p>We may update this policy as the application and its data practices change. The date at the top indicates when this page was last updated.</p>
      </Section>

      <Section title="Contact">
        <p>For privacy questions or requests, contact: {contactEmail}. Replace this placeholder with your monitored privacy/support email before submitting this URL to Meta.</p>
      </Section>
    </LegalLayout>
  );
}
export function TermsOfService() {
  return (
    <LegalLayout title="Terms of Service" description="These terms describe the basic rules for using Vyapar UI and the Smart Ads integration.">
      <Section title="Acceptance of Terms">
        <p>By using {appName}, you agree to these terms. If you do not agree, do not use the application or connect Meta/Facebook assets.</p>
      </Section>

      <Section title="Service Description">
        <p>
          {appName} provides business UI workflows including inventory, marketing tools, Online Store features, and Smart Ads. Smart Ads helps users prepare campaigns, connect Meta business assets, and create paused Meta advertising objects.
        </p>
      </Section>

      <Section title="Meta/Facebook Integration">
        <p>
          Advertising campaigns created through Smart Ads use Meta's advertising platform and are also subject to Meta's applicable terms, advertising standards, platform policies, and account requirements.
        </p>
      </Section>

      <Section title="User Responsibilities">
        <BulletList
          items={[
            "Provide accurate business, campaign, creative, budget, destination URL, and account information.",
            "Use only Meta Pages, Ad Accounts, images, and content you are authorized to use.",
            "Review all campaign settings before publishing, even when campaigns are created paused.",
          ]}
        />
      </Section>

      <Section title="Advertising Campaign Responsibility">
        <p>
          Users are responsible for their campaign content, targeting choices, budget settings, landing pages, legal compliance, and compliance with Meta advertising policies.
        </p>
      </Section>

      <Section title="Third-Party Services">
        <p>
          The app may connect with Meta/Facebook and other third-party services. We do not control third-party platforms, approvals, availability, ad delivery, review decisions, billing, or policy enforcement.
        </p>
      </Section>

      <Section title="Availability of Service">
        <p>The service may change, pause, or become unavailable due to maintenance, hosting, third-party API limitations, account restrictions, or platform policy changes.</p>
      </Section>

      <Section title="Limitation of Liability">
        <p>
          To the maximum extent permitted by law, {appName} is not liable for indirect losses, ad account restrictions, rejected ads, lost revenue, platform outages, or third-party policy decisions.
        </p>
      </Section>

      <Section title="Changes to Terms">
        <p>We may update these terms when the application, Smart Ads, backend storage, or Meta integration changes.</p>
      </Section>

      <Section title="Contact">
        <p>For terms questions, contact: {contactEmail}.</p>
      </Section>
    </LegalLayout>
  );
}

export function DataDeletion() {
  return (
    <LegalLayout
      title="User Data Deletion Instructions"
      description="Use this page to understand how to remove data associated with the current Meta/Facebook Smart Ads connection."
    >
      <Section title="Current Data Storage">
        <p>
          The current project does not have a persistent database for Meta connection data. Meta access tokens, connected user details, permissions, asset lists, and selected Page/Ad Account are stored temporarily in backend memory. Smart Ads drafts and publish records are stored in the user's browser local storage.
        </p>
      </Section>

      <Section title="Disconnect Meta in the App">
        <p>
          Open Smart Ads and use the Disconnect action in the Meta connection panel. This clears the temporary backend Meta connection state for the running server session.
        </p>
      </Section>

      <Section title="Remove App Access from Meta/Facebook">
        <p>
          You can also remove this app's permissions from your Meta/Facebook account settings. In Facebook, go to Settings and privacy, then Settings, then Business Integrations or Apps and Websites, find this app, and remove its access.
        </p>
      </Section>

      <Section title="Clear Browser Prototype Data">
        <p>
          Because campaign drafts and local publish records are currently saved in browser local storage, you can remove them by clearing site data for {productionDomain} in your browser settings.
        </p>
      </Section>

      <Section title="Request Deletion Assistance">
        <p>
          To request help removing data associated with your Meta/Facebook connection, contact: {contactEmail}. Include the business name and Meta account/Page/Ad Account reference if available. Do not send passwords, access tokens, or secrets.
        </p>
      </Section>

      <Section title="Future Persistent Storage">
        <p>
          If a database is added later, this page and the deletion process will be updated to describe permanent records and the exact deletion workflow.
        </p>
      </Section>
    </LegalLayout>
  );
}
