import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Voice Junctions | Talk with Strangers in 10-Seat Rooms",
  description:
    "Browse live 10-seat anonymous voice rooms. Talk with strangers across Gaming, Late Night Chill, Deep Talks, and Tech. Drop in or create your own room.",
  alternates: {
    canonical: "/junctions",
  },
};

export default function JunctionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
