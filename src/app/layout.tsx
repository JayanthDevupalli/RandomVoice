import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YapClub - 7-Seat Voice Hangouts | No Cap, Pure Yapping",
  description: "Drop into 7-seat anonymous voice rooms worldwide. Talk games, late night vibes, deep thoughts, and music with zero lag and zero signups.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
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
        {/* Global Background Glows - Subtle and Modern */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none -z-50">
          <div className="absolute top-[-10%] left-[-20%] sm:top-[-20%] sm:left-[-10%] w-[80%] h-[60%] sm:w-[60%] sm:h-[60%] bg-indigo-600/10 blur-[100px] sm:blur-[120px] rounded-full mix-blend-screen" />
          <div className="absolute bottom-[-10%] right-[-20%] sm:bottom-[-20%] sm:right-[-10%] w-[70%] h-[50%] sm:w-[50%] sm:h-[50%] bg-purple-600/10 blur-[100px] sm:blur-[120px] rounded-full mix-blend-screen" />
        </div>
        
        {children}
      </body>
    </html>
  );
}
