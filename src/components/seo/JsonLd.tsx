export function JsonLd() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yapclub.com";

  const schemaGraph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "YapClub",
        alternateName: [
          "Yap Club",
          "YapClub Anonymous Voice Chat",
          "Talk with Strangers Online - YapClub",
          "Talk to Anonymous - YapClub",
        ],
        description:
          "YapClub is the leading platform to talk with strangers and chat with anonymous people in 10-seat group voice rooms worldwide. Free, no download, and no camera pressure.",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteUrl}/junctions?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
        inLanguage: "en-US",
      },
      {
        "@type": "WebApplication",
        "@id": `${siteUrl}/#app`,
        name: "YapClub - Talk with Strangers & Anonymous Voice Chat",
        applicationCategory: "CommunicationApplication",
        operatingSystem: "Web, iOS, Android, macOS, Windows",
        url: siteUrl,
        description:
          "Free platform to talk with strangers online and meet anonymous people in cozy 10-seat group voice junction rooms. No signups, crystal-clear 3D audio, and active moderation.",
        browserRequirements: "Requires WebRTC and JavaScript support.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        featureList: [
          "Talk with strangers online instantly",
          "Talk with anonymous people in cozy 10-seat voice rooms",
          "Zero registration or phone number required to join as a guest",
          "Voice-only hangout: No webcam or camera anxiety",
          "Categorized voice rooms: Gaming, Late Night Chill, Deep Talks, Tech, Philosophy, Music",
          "Ultra-low latency crystal-clear WebRTC audio",
          "Community safety and live moderation tools",
        ],
      },
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "YapClub",
        url: siteUrl,
        logo: `${siteUrl}/webIcon.png`,
        sameAs: [
          "https://twitter.com/yapclub",
          "https://github.com/JayanthDevupalli/RandomVoice",
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faq`,
        mainEntity: [
          {
            "@type": "Question",
            name: "How do I talk with strangers on YapClub?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Talking with strangers on YapClub takes less than 5 seconds. Simply enter a temporary nickname on the homepage, select an avatar and aura color, and tap 'Enter Yap Rooms'. You can immediately jump into any active 10-seat voice room and start talking with random people worldwide.",
            },
          },
          {
            "@type": "Question",
            name: "Can I talk with anonymous people without registering or signing up?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes! YapClub is 100% free and requires zero signup or email verification to talk with strangers. You can join as an Instant Guest with a randomized persona. If you prefer to save your profile and friends later, you can create a member account at any time.",
            },
          },
          {
            "@type": "Question",
            name: "Do I need to turn on my camera or video to chat?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. YapClub is strictly a voice-first hangout platform. There are no webcams or video feeds, which eliminates the awkwardness, creepy video roulette behavior, and appearance pressure found on sites like Omegle. You only speak using your microphone.",
            },
          },
          {
            "@type": "Question",
            name: "Is YapClub safe for talking to strangers?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Safety is YapClub's top priority. All rooms feature community moderation tools (mute, kick, ban) and we enforce a strict zero-tolerance policy against hate speech, harassment, and predatory behavior. Additionally, your IP address is never exposed to other participants because audio streams route through secure LiveKit media servers.",
            },
          },
          {
            "@type": "Question",
            name: "Why 10-seat group voice rooms instead of 1-on-1 random chats?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Traditional 1-on-1 stranger roulette platforms suffer from rapid skips and awkward silences. YapClub's 10-seat voice junctions create natural, campfire-like group discussions where multiple people can talk, listen, and bond over shared topics like gaming, music, late-night vibes, and philosophy.",
            },
          },
          {
            "@type": "Question",
            name: "What topics can I talk about with anonymous strangers?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "YapClub has rooms for every mood: Late Night Chill, Deep Talks & Philosophy, Gaming Squads, Music & Beats, Tech & AI, Language Exchange, or Random Casual Banter. You can also create your own custom room topic instantly.",
            },
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph) }}
    />
  );
}
