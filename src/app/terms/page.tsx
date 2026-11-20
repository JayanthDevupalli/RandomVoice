import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Shield, FileText, UserCheck, AlertTriangle, Scale, Lock, RefreshCw } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service | YapClub",
  description:
    "YapClub terms of service and user agreement. Understand your rights and responsibilities when using our anonymous and member voice rooms.",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-slate-100 selection:bg-indigo-500 selection:text-white px-4 sm:px-6 py-12">
      <div className="max-w-3xl mx-auto">
        {/* Navigation Header */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
          >
            <ArrowLeft size={13} />
            <span>Back to Home</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <img
              src="/webIcon.png"
              alt="YapClub Logo"
              className="h-7 w-auto object-contain filter drop-shadow-[0_2px_8px_rgba(99,102,241,0.3)]"
            />
            <span className="font-bold text-base tracking-tight text-white flex items-center">
              yap<span className="text-slate-400 font-normal">club</span>
            </span>
          </div>
        </div>

        {/* Page Title */}
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30">
            <FileText size={22} />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Terms of <span className="text-indigo-400">Service</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Last updated: November 2026</p>
          </div>
        </div>

        <p className="text-slate-400 mb-8 text-sm sm:text-base leading-relaxed">
          Welcome to YapClub. By accessing or using our website, audio rooms, and messaging services, you agree to comply with and be bound by these Terms of Service. If you do not agree, please do not use YapClub.
        </p>

        {/* Terms Sections */}
        <div className="space-y-6">
          {/* Section 1 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <UserCheck size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">1. Eligibility & Age Requirement</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              You must be at least <strong>18 years old</strong> to use YapClub. By entering the platform or agreeing to our terms, you represent and warrant that you are 18 or older. Minors are strictly prohibited from participating in voice rooms or sending messages.
            </p>
          </section>

          {/* Section 2 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Shield size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">2. Guest & Account Identities</h2>
            </div>
            <div className="space-y-2 text-slate-300 text-sm leading-relaxed">
              <p>
                YapClub supports both <strong>Instant Guest</strong> participation and <strong>Registered Accounts</strong>.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 text-xs sm:text-sm">
                <li>You are responsible for all activity conducted under your guest identity or account handle.</li>
                <li>Impersonation of platform staff, other users, or public figures is strictly prohibited.</li>
                <li>You may delete your account and personal data at any time through your Profile settings.</li>
              </ul>
            </div>
          </section>

          {/* Section 3 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                <AlertTriangle size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">3. Acceptable Use & Conduct</h2>
            </div>
            <div className="space-y-2 text-slate-300 text-sm leading-relaxed">
              <p>
                YapClub is meant for fun, casual, and safe conversations. You agree NOT to:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 text-xs sm:text-sm">
                <li>Harass, threaten, bully, defame, or intimidate other participants.</li>
                <li>Share non-consensual sexually explicit content, solicitations, or hate speech.</li>
                <li>Distribute malicious links, IP-loggers, malware, or phishing campaigns.</li>
                <li>Attempt to reverse-engineer, exploit, overload, or bypass rate limits or access controls.</li>
                <li>Deploy automated bots or mass scrapers without explicit administrative approval.</li>
              </ul>
            </div>
          </section>

          {/* Section 4 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Lock size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">4. Voice Hangouts & Ephemeral Communications</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              Voice audio is streamed in real-time via WebRTC data protocols and is <strong>not permanently recorded or archived by YapClub servers</strong>. However, because you are speaking in rooms with other individuals, always exercise sound personal judgment regarding what you choose to share verbally.
            </p>
          </section>

          {/* Section 5 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Scale size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">5. Moderation & Termination</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              Room creators and platform moderators possess full discretion to mute, kick, or temporarily ban users from rooms. YapClub administrators reserve the right to suspend or permanently terminate accounts or ban IP addresses that violate these Terms or our <Link href="/guidelines" className="text-indigo-400 hover:text-indigo-300 underline">Community Guidelines</Link> without prior notice.
            </p>
          </section>

          {/* Section 6 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <AlertTriangle size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">6. Disclaimers & Limitation of Liability</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              YapClub is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis for casual social entertainment. We do not guarantee uninterrupted availability or endorse opinions expressed by participants. In no event shall YapClub or its operators be liable for indirect, incidental, or consequential damages resulting from user interactions or platform access.
            </p>
          </section>

          {/* Section 7 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <RefreshCw size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">7. Modifications to Terms</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              We may update these Terms periodically. Continued use of YapClub following updates constitutes acceptance of the modified Terms.
            </p>
          </section>
        </div>

        {/* Footer Navigation */}
        <div className="mt-12 pt-6 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>yapclub © {new Date().getFullYear()}</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</Link>
            <Link href="/guidelines" className="hover:text-slate-300 transition-colors">Guidelines</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
