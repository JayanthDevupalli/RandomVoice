import type { Metadata, Viewport } from "next";
import "./globals.css";
import dynamic from "next/dynamic";
import { GlobalPresenceProvider } from "@/components/providers/GlobalPresenceProvider";
import { DMVoiceCallProvider } from "@/components/providers/DMVoiceCallContext";
import { ActiveJunctionProvider } from "@/components/providers/ActiveJunctionContext";
import { UserProvider } from "@/components/providers/UserProvider";
import { MaintenanceBanner } from "@/components/layout/MaintenanceBanner";
import { JsonLd } from "@/components/seo/JsonLd";

const DMVoiceCallOverlay = dynamic(
  () => import("@/components/voice/DMVoiceCallOverlay").then((mod) => mod.DMVoiceCallOverlay),
  { ssr: false }
);

const ActiveJunctionOverlay = dynamic(
  () => import("@/components/voice/ActiveJunctionOverlay").then((mod) => mod.ActiveJunctionOverlay),
  { ssr: false }
);

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yapclub.com";

export const viewport: Viewport = {
  themeColor: "#0B0C10",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "YapClub - Talk with Strangers & Anonymous Voice Chat Online",
    template: "%s | YapClub",
  },
  description:
    "Talk with strangers and chat with anonymous people online in instant 10-seat voice rooms. Zero signups, zero camera pressure, crystal-clear 3D audio, and global topics 24/7.",
  keywords: [
    "talk with strangers",
    "talk with anonymous",
    "talk to strangers",
    "anonymous voice chat",
    "talk to strangers online",
    "random voice chat",
    "talk to strangers voice",
    "anonymous chat rooms",
    "talk to random people",
    "voice chat with strangers",
    "free stranger chat",
    "talk anonymously online",
    "no signup voice chat",
    "stranger voice chat no login",
    "yapclub",
    "yap club",
    "omegle alternative voice chat"
  ],
  authors: [{ name: "YapClub Team", url: siteUrl }],
  creator: "YapClub",
  publisher: "YapClub",
  applicationName: "YapClub",
  category: "communication",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    title: "YapClub - Talk with Strangers & Anonymous Voice Chat Online",
    description:
      "Drop into free 10-seat anonymous voice rooms. Talk with strangers worldwide with zero signups and zero video pressure.",
    siteName: "YapClub",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "YapClub - Talk with Strangers & Anonymous Voice Chat Online",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "YapClub - Talk with Strangers & Anonymous Voice Chat Online",
    description:
      "Drop into free 10-seat anonymous voice rooms. Talk with strangers worldwide with zero signups and zero video pressure.",
    images: ["/og-image.svg"],
    creator: "@yapclub",
  },
  icons: {
    icon: "/webIcon.png",
    shortcut: "/webIcon.png",
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.webmanifest",
  verification: {
    google: "googlebdce190a23b0f566",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/webIcon.png" type="image/png" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://livekit.cloud" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for(let registration of registrations) {
                      registration.unregister();
                    }
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased selection:bg-indigo-500/30 selection:text-white font-sans overflow-x-hidden relative">
        <JsonLd />
        <UserProvider>
          <GlobalPresenceProvider>
            <DMVoiceCallProvider>
              <ActiveJunctionProvider>
                {/* Global Background Glows - Subtle and Modern */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none -z-50">
                  <div className="absolute top-[-10%] left-[-20%] sm:top-[-20%] sm:left-[-10%] w-[80%] h-[60%] sm:w-[60%] sm:h-[60%] bg-indigo-600/10 blur-[100px] sm:blur-[120px] rounded-full mix-blend-screen" />
                  <div className="absolute bottom-[-10%] right-[-20%] sm:bottom-[-20%] sm:right-[-10%] w-[70%] h-[50%] sm:w-[50%] sm:h-[50%] bg-purple-600/10 blur-[100px] sm:blur-[120px] rounded-full mix-blend-screen" />
                </div>
                
                <MaintenanceBanner />
                {children}
                <DMVoiceCallOverlay />
                <ActiveJunctionOverlay />
              </ActiveJunctionProvider>
            </DMVoiceCallProvider>
          </GlobalPresenceProvider>
        </UserProvider>
      </body>
    </html>
  );
}


