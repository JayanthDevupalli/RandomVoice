"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, Loader2, Sparkles, Flame, Smile, Heart, Gamepad2, Tv, ThumbsUp, PartyPopper } from "lucide-react";

interface GifItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
}

interface GifPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGif: (gifUrl: string, title: string) => void;
}

const CATEGORIES = [
  { id: "trending", label: "Trending", icon: Flame },
  { id: "reactions", label: "Reactions", icon: Smile },
  { id: "lmao", label: "LMAO", icon: Smile },
  { id: "love", label: "Love", icon: Heart },
  { id: "party", label: "Party", icon: PartyPopper },
  { id: "dance", label: "Dance", icon: Sparkles },
  { id: "gaming", label: "Gaming", icon: Gamepad2 },
  { id: "anime", label: "Anime", icon: Tv },
  { id: "yes", label: "Yes/No", icon: ThumbsUp },
];

// Rich, curated collection of guaranteed fast-loading animated GIFs across categories
const CURATED_GIFS: Record<string, GifItem[]> = {
  trending: [
    { id: "t1", title: "Excited Dance", url: "https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif", previewUrl: "https://media.giphy.com/media/blSTtZehjAZ8I/200w.gif" },
    { id: "t2", title: "Mind Blown", url: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif", previewUrl: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/200w.gif" },
    { id: "t3", title: "Popcorn Watching", url: "https://media.giphy.com/media/gl0mkIZOW6Nwc/giphy.gif", previewUrl: "https://media.giphy.com/media/gl0mkIZOW6Nwc/200w.gif" },
    { id: "t4", title: "Cat Vibe", url: "https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif", previewUrl: "https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/200w.gif" },
    { id: "t5", title: "Applause", url: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif", previewUrl: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif" },
    { id: "t6", title: "Let's Go", url: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif", previewUrl: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif" },
  ],
  reactions: [
    { id: "r1", title: "Shocked Face", url: "https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif", previewUrl: "https://media.giphy.com/media/5VKbvrjxpVJCM/200w.gif" },
    { id: "r2", title: "Confused Travolta", url: "https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/giphy.gif", previewUrl: "https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/200w.gif" },
    { id: "r3", title: "Thumbs Up Kid", url: "https://media.giphy.com/media/nXxOjZrbnbRxS/giphy.gif", previewUrl: "https://media.giphy.com/media/nXxOjZrbnbRxS/200w.gif" },
    { id: "r4", title: "Facepalm", url: "https://media.giphy.com/media/xsF1FSDbjguis/giphy.gif", previewUrl: "https://media.giphy.com/media/xsF1FSDbjguis/200w.gif" },
    { id: "r5", title: "Nodding Yes", url: "https://media.giphy.com/media/NEvPzZ8bd1V4Y/giphy.gif", previewUrl: "https://media.giphy.com/media/NEvPzZ8bd1V4Y/200w.gif" },
    { id: "r6", title: "Side Eye Dog", url: "https://media.giphy.com/media/H5C8CevNMbpBqNqFjl/giphy.gif", previewUrl: "https://media.giphy.com/media/H5C8CevNMbpBqNqFjl/200w.gif" },
  ],
  lmao: [
    { id: "l1", title: "Laughing Out Loud", url: "https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif", previewUrl: "https://media.giphy.com/media/10JhviFuU2gWD6/200w.gif" },
    { id: "l2", title: "Wheezing Laugh", url: "https://media.giphy.com/media/3oEjHAUOqG3lSS0f1C/giphy.gif", previewUrl: "https://media.giphy.com/media/3oEjHAUOqG3lSS0f1C/200w.gif" },
    { id: "l3", title: "Rolling Laughing", url: "https://media.giphy.com/media/9MFsKQ8A6HCN2/giphy.gif", previewUrl: "https://media.giphy.com/media/9MFsKQ8A6HCN2/200w.gif" },
    { id: "l4", title: "Cat Laugh", url: "https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif", previewUrl: "https://media.giphy.com/media/MDJ9IbxxvDUQM/200w.gif" },
    { id: "l5", title: "Tears of Joy", url: "https://media.giphy.com/media/ZqlvCTNHpqrio/giphy.gif", previewUrl: "https://media.giphy.com/media/ZqlvCTNHpqrio/200w.gif" },
    { id: "l6", title: "Giggle", url: "https://media.giphy.com/media/ltIFdjNAasOwVvKhvx/giphy.gif", previewUrl: "https://media.giphy.com/media/ltIFdjNAasOwVvKhvx/200w.gif" },
  ],
  love: [
    { id: "lv1", title: "Heart Eyes", url: "https://media.giphy.com/media/26FLdmIp6wJr91JAI/giphy.gif", previewUrl: "https://media.giphy.com/media/26FLdmIp6wJr91JAI/200w.gif" },
    { id: "lv2", title: "Sending Love", url: "https://media.giphy.com/media/PQKlfqn2EzUbi/giphy.gif", previewUrl: "https://media.giphy.com/media/PQKlfqn2EzUbi/200w.gif" },
    { id: "lv3", title: "Hugs", url: "https://media.giphy.com/media/l8ooOxhcItoww/giphy.gif", previewUrl: "https://media.giphy.com/media/l8ooOxhcItoww/200w.gif" },
    { id: "lv4", title: "Cat Hug", url: "https://media.giphy.com/media/5OqXb948EBkyUcnwHt/giphy.gif", previewUrl: "https://media.giphy.com/media/5OqXb948EBkyUcnwHt/200w.gif" },
    { id: "lv5", title: "Puppy Eyes", url: "https://media.giphy.com/media/uw0KqTWZSm8gg/giphy.gif", previewUrl: "https://media.giphy.com/media/uw0KqTWZSm8gg/200w.gif" },
    { id: "lv6", title: "Sparkling Hearts", url: "https://media.giphy.com/media/M90mJvfWfd5mbUuULX/giphy.gif", previewUrl: "https://media.giphy.com/media/M90mJvfWfd5mbUuULX/200w.gif" },
  ],
  party: [
    { id: "p1", title: "Confetti Celebration", url: "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif", previewUrl: "https://media.giphy.com/media/g9582DNuQppxC/200w.gif" },
    { id: "p2", title: "Dancing Dog", url: "https://media.giphy.com/media/mKMGLhoD8L4yc/giphy.gif", previewUrl: "https://media.giphy.com/media/mKMGLhoD8L4yc/200w.gif" },
    { id: "p3", title: "Kermit Dance", url: "https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif", previewUrl: "https://media.giphy.com/media/blSTtZehjAZ8I/200w.gif" },
    { id: "p4", title: "Champagne Pop", url: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif", previewUrl: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif" },
    { id: "p5", title: "Disco Lights", url: "https://media.giphy.com/media/l3q2zbskZp2j8wniE/giphy.gif", previewUrl: "https://media.giphy.com/media/l3q2zbskZp2j8wniE/200w.gif" },
    { id: "p6", title: "Cheers", url: "https://media.giphy.com/media/Zw3oBUuIg23EWJYv2Q/giphy.gif", previewUrl: "https://media.giphy.com/media/Zw3oBUuIg23EWJYv2Q/200w.gif" },
  ],
  dance: [
    { id: "d1", title: "Snoopy Dance", url: "https://media.giphy.com/media/mKMGLhoD8L4yc/giphy.gif", previewUrl: "https://media.giphy.com/media/mKMGLhoD8L4yc/200w.gif" },
    { id: "d2", title: "Carlton Dance", url: "https://media.giphy.com/media/pa37AAGzKXoek/giphy.gif", previewUrl: "https://media.giphy.com/media/pa37AAGzKXoek/200w.gif" },
    { id: "d3", title: "Groovy Cat", url: "https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif", previewUrl: "https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/200w.gif" },
    { id: "d4", title: "Moonwalk", url: "https://media.giphy.com/media/12cpBxBlEvgsuQ/giphy.gif", previewUrl: "https://media.giphy.com/media/12cpBxBlEvgsuQ/200w.gif" },
    { id: "d5", title: "Robot Dance", url: "https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif", previewUrl: "https://media.giphy.com/media/blSTtZehjAZ8I/200w.gif" },
    { id: "d6", title: "Happy Dance", url: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif", previewUrl: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif" },
  ],
  gaming: [
    { id: "g1", title: "Victory Royale", url: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif", previewUrl: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif" },
    { id: "g2", title: "Gamer Rage", url: "https://media.giphy.com/media/11tTNkNy1SdXGg/giphy.gif", previewUrl: "https://media.giphy.com/media/11tTNkNy1SdXGg/200w.gif" },
    { id: "g3", title: "Mario Level Up", url: "https://media.giphy.com/media/atQF1zaSGq8s8/giphy.gif", previewUrl: "https://media.giphy.com/media/atQF1zaSGq8s8/200w.gif" },
    { id: "g4", title: "Pro Gamer Move", url: "https://media.giphy.com/media/d4zHnLjdy48Cc/giphy.gif", previewUrl: "https://media.giphy.com/media/d4zHnLjdy48Cc/200w.gif" },
    { id: "g5", title: "GG WP", url: "https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/giphy.gif", previewUrl: "https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/200w.gif" },
    { id: "g6", title: "Game Over", url: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif", previewUrl: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/200w.gif" },
  ],
  anime: [
    { id: "a1", title: "Anime Wow", url: "https://media.giphy.com/media/bDWdJRY2IZCX6/giphy.gif", previewUrl: "https://media.giphy.com/media/bDWdJRY2IZCX6/200w.gif" },
    { id: "a2", title: "Pikachu Shock", url: "https://media.giphy.com/media/6nWhy3ulBL7GSCvKw6/giphy.gif", previewUrl: "https://media.giphy.com/media/6nWhy3ulBL7GSCvKw6/200w.gif" },
    { id: "a3", title: "Naruto Run", url: "https://media.giphy.com/media/JRlqKEzTDKcibTGvnL/giphy.gif", previewUrl: "https://media.giphy.com/media/JRlqKEzTDKcibTGvnL/200w.gif" },
    { id: "a4", title: "Anime Cheer", url: "https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.gif", previewUrl: "https://media.giphy.com/media/13CoXDiaCcCoyk/200w.gif" },
    { id: "a5", title: "Anime Cry", url: "https://media.giphy.com/media/d2lcHJTG5Tscg/giphy.gif", previewUrl: "https://media.giphy.com/media/d2lcHJTG5Tscg/200w.gif" },
    { id: "a6", title: "Anime Nod", url: "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif", previewUrl: "https://media.giphy.com/media/111ebonMs90YLu/200w.gif" },
  ],
  yes: [
    { id: "y1", title: "Yes Absolutely", url: "https://media.giphy.com/media/nXxOjZrbnbRxS/giphy.gif", previewUrl: "https://media.giphy.com/media/nXxOjZrbnbRxS/200w.gif" },
    { id: "y2", title: "No Way", url: "https://media.giphy.com/media/12XMGIWtrHBl5e/giphy.gif", previewUrl: "https://media.giphy.com/media/12XMGIWtrHBl5e/200w.gif" },
    { id: "y3", title: "100 Percent", url: "https://media.giphy.com/media/NEvPzZ8bd1V4Y/giphy.gif", previewUrl: "https://media.giphy.com/media/NEvPzZ8bd1V4Y/200w.gif" },
    { id: "y4", title: "Nope", url: "https://media.giphy.com/media/H1wHUjMxrwgb6/giphy.gif", previewUrl: "https://media.giphy.com/media/H1wHUjMxrwgb6/200w.gif" },
    { id: "y5", title: "Agreed", url: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif", previewUrl: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif" },
    { id: "y6", title: "Never", url: "https://media.giphy.com/media/3o7TKwmnDgQb5jemjK/giphy.gif", previewUrl: "https://media.giphy.com/media/3o7TKwmnDgQb5jemjK/200w.gif" },
  ],
};

export function GifPicker({ isOpen, onClose, onSelectGif }: GifPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GifItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Live GIF search (Giphy public API with reliable fallback)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const query = encodeURIComponent(searchQuery.trim());
        // Use Giphy public beta search API
        const res = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh&q=${query}&limit=18&rating=g`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data) && data.data.length > 0) {
            const formatted: GifItem[] = data.data.map((item: any) => ({
              id: item.id,
              title: item.title || searchQuery,
              url: item.images?.original?.url || item.images?.downsized?.url || item.images?.fixed_height?.url,
              previewUrl: item.images?.fixed_width_small?.url || item.images?.fixed_height_small?.url || item.images?.original?.url,
            })).filter((g: GifItem) => Boolean(g.url));

            if (formatted.length > 0) {
              setSearchResults(formatted);
              setIsSearching(false);
              return;
            }
          }
        }
      } catch (e) {
        // Fallback to local search across curated collection
      }

      // Local fallback search
      const q = searchQuery.toLowerCase();
      const allCurated = Object.values(CURATED_GIFS).flat();
      const filtered = allCurated.filter(
        (g, idx, self) =>
          self.findIndex((s) => s.id === g.id) === idx &&
          g.title.toLowerCase().includes(q)
      );
      setSearchResults(filtered);
      setIsSearching(false);
    }, 350);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  if (!isOpen) return null;

  const currentGifs = searchResults !== null ? searchResults : CURATED_GIFS[selectedCategory] || CURATED_GIFS.trending;

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[115] sm:hidden animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div 
        ref={pickerRef}
        className="fixed inset-x-0 bottom-0 z-[120] rounded-t-[1.75rem] max-h-[82vh] sm:max-h-none sm:rounded-2xl sm:absolute sm:bottom-full sm:mb-3 sm:left-0 sm:right-auto sm:w-[380px] sm:inset-x-auto sm:inset-y-auto bg-[#12131D] sm:bg-[#12131D]/95 sm:backdrop-blur-2xl border-t sm:border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-bottom-2 sm:zoom-in-95 duration-200"
      >
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0" />

        {/* Header & Search */}
        <div className="p-3 border-b border-white/10 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <Sparkles size={14} />
              </div>
              <span className="text-xs font-bold text-white tracking-wide uppercase">Send a GIF</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close GIF Picker"
            >
              <X size={15} />
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search GIFs on GIPHY..."
              className="w-full pl-8 pr-8 py-2 bg-black/40 border border-white/10 rounded-xl text-sm sm:text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/60 transition-colors"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Categories Bar (hidden if searching) */}
          {!searchQuery && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    <Icon size={13} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* GIFs Grid */}
        <div className="p-3 h-72 overflow-y-auto overflow-x-hidden">
          {isSearching ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin text-indigo-500" />
              <span className="text-xs">Searching GIFs...</span>
            </div>
          ) : currentGifs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <p className="text-xs font-semibold text-slate-300 mb-1">No GIFs found</p>
              <p className="text-[11px] text-slate-500">Try searching for &quot;laugh&quot;, &quot;dance&quot;, or &quot;hype&quot;</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 gap-2">
              {currentGifs.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => {
                    onSelectGif(gif.url, gif.title);
                    onClose();
                  }}
                  className="group relative aspect-video bg-black/40 rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/50 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shadow-sm"
                  title={gif.title}
                >
                  <img
                    src={gif.previewUrl || gif.url}
                    alt={gif.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                    <span className="text-[10px] text-white font-medium truncate w-full leading-tight">
                      {gif.title}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer Branding */}
        <div className="px-3 py-2 sm:py-1.5 bg-black/40 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <span>Click any GIF to send immediately</span>
          <span className="font-semibold text-indigo-400/80">Powered by GIPHY</span>
        </div>
      </div>
    </>
  );
}
