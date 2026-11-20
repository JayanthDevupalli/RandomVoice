import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Shield, Eye, Lock, Camera, Trash2, Cpu, CheckCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | YapClub",
  description:
    "YapClub privacy policy. Learn how we prioritize user anonymity, auto-strip photo EXIF/GPS metadata, and handle real-time audio streams securely without recording.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
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
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/30">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Privacy <span className="text-emerald-400">Policy</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Last updated: November 2026</p>
          </div>
        </div>

        <p className="text-slate-400 mb-8 text-sm sm:text-base leading-relaxed">
          At YapClub, we believe the best online social spaces are casual, carefree, and privacy-respecting. We collect only what is strictly necessary to run the service and never sell, broker, or monetize your personal information.
        </p>

        {/* Highlights Banner */}
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-8 flex items-start gap-3">
          <CheckCircle size={20} className="text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-emerald-200 leading-relaxed">
            <strong>YapClub Privacy Guarantee:</strong> No real identity required • No voice recording • GPS & EXIF camera metadata automatically stripped before upload • Optional 24-hour casual disappearing messages.
          </div>
        </div>

        {/* Privacy Sections */}
        <div className="space-y-6">
          {/* Section 1 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Eye size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">1. Information We Collect</h2>
            </div>
            <div className="space-y-2 text-slate-300 text-sm leading-relaxed">
              <p>We minimize data collection by design:</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 text-xs sm:text-sm">
                <li><strong className="text-slate-200">User Identity:</strong> Your chosen handle or guest display name, avatar icon, and optional bio/theme preferences.</li>
                <li><strong className="text-slate-200">Instant Guests:</strong> No email or phone number is ever requested or stored for guest users.</li>
                <li><strong className="text-slate-200">Registered Accounts:</strong> Credentials (passwords are one-way hashed with bcrypt/SHA-256) and recovery keys.</li>
                <li><strong className="text-slate-200">Technical Logs:</strong> Anonymized rate-limiting timestamps and IP address hashes used exclusively for anti-abuse and spam protection.</li>
              </ul>
            </div>
          </section>

          {/* Section 2 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Camera size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">2. Automatic EXIF & GPS Metadata Stripping</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              When you upload a custom profile picture, YapClub&apos;s client-side privacy sanitizer automatically redraws the image on an isolated offscreen canvas before upload. This <strong>permanently removes all GPS geolocation tags, camera model identifiers, timestamps, and device serial numbers</strong>, guaranteeing your real-world location is never exposed through uploaded images.
            </p>
          </section>

          {/* Section 3 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Cpu size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">3. Real-Time Audio Streaming (No Recordings)</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              YapClub voice rooms operate using high-speed WebRTC data pipelines powered by LiveKit. Audio packets travel through memory in real time to room listeners and are <strong>never recorded, transcribed, or stored on YapClub disk servers</strong>. Once you stop speaking or leave a room, your voice stream ceases immediately.
            </p>
          </section>

          {/* Section 4 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <Lock size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">4. Messages & 24h Casual Mode</h2>
            </div>
            <div className="space-y-2 text-slate-300 text-sm leading-relaxed">
              <p>
                In Direct Messages (DMs) and group chats:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 text-xs sm:text-sm">
                <li>You can clear conversation logs for yourself at any time with the &ldquo;Clear Chat&rdquo; action.</li>
                <li>You can activate <strong>24h Casual Mode</strong> for any conversation, causing messages older than 24 hours to vanish automatically from view.</li>
                <li>Our composer includes smart soft-warnings for sensitive numbers (phones, OTPs, UPI) and automatically blocks known tracking and IP-logger domains.</li>
              </ul>
            </div>
          </section>

          {/* Section 5 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                <Trash2 size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">5. Data Retention & Permanent Deletion</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              You maintain full ownership of your account. If you choose to delete your account via Profile &gt; Settings &gt; Delete Account, all associated records, profiles, messages, and uploaded photos are <strong>permanently and irreversibly purged from our database</strong>.
            </p>
          </section>

          {/* Section 6 */}
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-slate-500/10 text-slate-400">
                <Shield size={18} />
              </div>
              <h2 className="text-lg font-bold text-white">6. Third-Party Infrastructure</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              YapClub utilizes trusted enterprise cloud infrastructure providers to run our backend (Supabase for managed database and session verification, and LiveKit Cloud for real-time WebRTC media routing). These providers adhere to rigorous global security standards and are bound to process platform data solely as required to deliver the service.
            </p>
          </section>
        </div>

        {/* Footer Navigation */}
        <div className="mt-12 pt-6 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>yapclub © {new Date().getFullYear()}</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-slate-300 transition-colors">Terms of Service</Link>
            <Link href="/guidelines" className="hover:text-slate-300 transition-colors">Guidelines</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
