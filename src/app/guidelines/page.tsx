import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ShieldAlert, Heart, Scale, Coffee } from "lucide-react";

export const metadata: Metadata = {
  title: "Community Guidelines & Safety Rules | Talk Safely With Strangers",
  description:
    "YapClub safety guidelines and code of conduct for talking with strangers and anonymous voice hangouts. Zero tolerance for harassment, hate speech, or abuse.",
  alternates: {
    canonical: "/guidelines",
  },
};

export default function GuidelinesPage() {
  return (
    <div className="min-h-screen bg-background text-slate-100 selection:bg-indigo-500 selection:text-white px-4 sm:px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
          >
            <ArrowLeft size={13} />
            <span>Back to Home</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <img src="/webIcon.png" alt="YapClub Logo" className="h-7 w-auto object-contain filter drop-shadow-[0_2px_8px_rgba(99,102,241,0.3)]" />
            <span className="font-bold text-base tracking-tight text-white flex items-center">
              yap<span className="text-slate-400 font-normal">club</span>
            </span>
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4">
          Community <span className="text-indigo-400">Guidelines</span>
        </h1>
        <p className="text-slate-400 mb-10 text-sm sm:text-base leading-relaxed">
          YapClub is a place for spontaneous, anonymous, and fun conversations. To keep this community a safe space for everyone, we have a few strict rules.
        </p>

        <div className="space-y-8">
          <section className="p-6 rounded-2xl bg-indigo-500/[0.07] border border-indigo-400/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <Coffee size={20} />
              </div>
              <h2 className="text-xl font-bold text-white">The Vibe Check (TL;DR)</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed mb-3">
              YapClub is built for light, fun, casual hangouts — not heavy real-world drama. Keep your conversations easygoing and protect your peace:
            </p>
            <ul className="space-y-2 text-slate-400 text-sm leading-relaxed list-disc pl-5">
              <li><strong className="text-slate-200">Stay naturally anonymous:</strong> Don&apos;t rush to share your phone number, home/college address, Instagram, or UPI ID with people you just met.</li>
              <li><strong className="text-slate-200">Never share OTPs, passwords, or money:</strong> Real YapClub staff will never ask you for codes, logins, or payments.</li>
              <li><strong className="text-slate-200">Zero awkwardness leaving:</strong> If a room or chat feels off, mute, hop to another room, or tap block — no explanation needed.</li>
              <li><strong className="text-slate-200">Keep internet stuff light:</strong> Remember avatars aren&apos;t real life. Enjoy the banter, leave the stress offline.</li>
            </ul>
          </section>

          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Heart size={20} />
              </div>
              <h2 className="text-xl font-bold text-white">1. Be Polite and Respectful</h2>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Treat everyone with respect. Disagreements happen, but personal attacks, harassment, hate speech, and bullying are completely unacceptable. Remember there&apos;s a real person behind every avatar.
            </p>
          </section>

          <section className="p-6 rounded-2xl bg-card border border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-rose-600/20 text-rose-400 border border-rose-500/30">
                <ShieldAlert size={20} />
              </div>
              <h2 className="text-xl font-bold text-white">2. Zero Tolerance for Sexual Harassment</h2>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              We have a strict <strong>zero-tolerance policy</strong> for sexual harassment, abuse, or predatory behavior. This includes unsolicited sexual remarks, threats, or any non-consensual sexual conversations. Violators will be permanently banned from the platform.
            </p>
          </section>

          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
                <Scale size={20} />
              </div>
              <h2 className="text-xl font-bold text-white">3. Report and Moderate</h2>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Moderators in each junction room have the power to mute, kick, or ban users who violate these guidelines. If you experience abuse, please inform the room moderator or leave the junction immediately.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
