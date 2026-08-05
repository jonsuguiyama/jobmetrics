import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

const sections: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "1. What we collect",
    body: (
      <>
        <p>
          When you sign in with GitHub or Google, we receive your email address and store it
          together with the provider you used (&quot;github&quot; or &quot;google&quot;) so we
          can identify your account and enforce the daily search limit below. We do not receive
          or store your OAuth password - authentication is handled entirely by GitHub/Google.
        </p>
        <p>
          When you upload a resume or paste a job description, that text is processed to produce
          a match score. See &quot;How your resume and job data are handled&quot; below for
          exactly where that text goes and how long it lives.
        </p>
      </>
    ),
  },
  {
    heading: "2. How your resume and job data are handled",
    body: (
      <>
        <p>
          Your resume file is parsed on our server to extract its text and that text is returned
          to your browser - it is not written to a database. When you start a search, your resume
          text and the job posting text (fetched from public GitHub repositories, or pasted by
          you) are sent through a message queue to a worker process, which forwards both to
          Google&apos;s Gemini API to generate a match score.
        </p>
        <p>
          The resulting scores are cached in Redis under a random per-search session id and
          automatically expire after 2 hours. The queue message itself is deleted once the worker
          has processed it. We do not keep your resume text or the job postings you searched
          against in permanent storage.
        </p>
      </>
    ),
  },
  {
    heading: "3. Third parties involved in processing",
    body: (
      <>
        <p>Depending on what you do, your data passes through:</p>
        <ul className="list-disc pl-5">
          <li>GitHub and Google, for sign-in and (for GitHub) fetching public job postings.</li>
          <li>Google&apos;s Gemini API, to score your resume against a job posting.</li>
          <li>Neon (Postgres), to store your account email/provider and daily search count.</li>
          <li>Upstash Redis and RabbitMQ, to move and temporarily cache data during a search.</li>
          <li>Vercel Analytics, for aggregate, cookie-less page-view statistics.</li>
        </ul>
        <p>Each of these processors has its own privacy policy governing how it handles data.</p>
      </>
    ),
  },
  {
    heading: "4. Cookies",
    body: (
      <p>
        We set one cookie: the session cookie used to keep you signed in. It is required for the
        app to work and is not used for tracking or advertising. Vercel Analytics does not use
        cookies.
      </p>
    ),
  },
  {
    heading: "5. Your rights",
    body: (
      <p>
        You can ask us to delete your account data (email, provider, and search count history) at
        any time by contacting us at the address below. Since resume and job text are not stored
        permanently, there is nothing further to delete there once your search session expires.
      </p>
    ),
  },
  {
    heading: "6. Security",
    body: (
      <p>
        Data in transit to and from this app is encrypted (HTTPS/WSS). Access to the database and
        cache is restricted to the app&apos;s own backend services.
      </p>
    ),
  },
  {
    heading: "7. Changes to this policy",
    body: (
      <p>
        If this policy changes in a way that affects how your data is handled, we will update
        this page and change the date below.
      </p>
    ),
  },
  {
    heading: "8. Contact",
    body: (
      <p>
        Questions or deletion requests: reach out via the contact details on{" "}
        <a
          href="https://github.com/jonsuguiyama"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          github.com/jonsuguiyama
        </a>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted">Last updated: August 5, 2026</p>
      </div>

      <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-6">
        {sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted [&_ul]:mt-1 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
