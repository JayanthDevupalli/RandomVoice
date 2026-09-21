import Link from "next/link";
import { ArrowLeft, ShieldAlert, Heart, Scale } from "lucide-react";

export default function GuidelinesPage() {
  return (
    <div className="min-h-screen bg-background text-slate-100 selection:bg-indigo-500 selection:text-white px-4 sm:px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-8 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
        >
          <ArrowLeft size={13} />
          <span>Back to Home</span>
        </Link>

        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4">
          Community <span className="text-indigo-400">Guidelines</span>
        </h1>
        <p className="text-slate-400 mb-10 text-sm sm:text-base leading-relaxed">
          YapClub is a place for spontaneous, anonymous, and fun conversations. To keep this community a safe space for everyone, we have a few strict rules.
        </p>

        <div className="space-y-8">
          <section className="p-6 rounded-2xl bg-card border border-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Heart size={20} />
              </div>
              <h2 className="text-xl font-bold text-white">1. Be Polite and Respectful</h2>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Treat everyone with respect. Disagreements happen, but personal attacks, harassment, hate speech, and bullying are completely unacceptable. Remember there's a real person behind every avatar.
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
