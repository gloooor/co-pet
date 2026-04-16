"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "framer-motion";

type Mood = "happy" | "sad" | "hungry";
type PetAction = "feed" | "play" | "rest";
type PetRow = {
  id: string;
  mood: Mood;
  hunger_level: number;
  happiness: number;
  food: number;
  energy: number;
  last_updated: string;
  last_action_by?: string | null;
  last_action_type?: string | null;
};

type PetCurrentPutBody = {
  action?: PetAction;
  userName?: string;
};

async function fetchCurrent(): Promise<PetRow> {
  const res = await fetch("/api/pet-state/current", { cache: "no-store" });
  const json = (await res.json()) as { row?: PetRow; error?: string };
  if (!res.ok || !json.row) throw new Error(json.error ?? "Failed to load pet_state.");
  return json.row;
}

async function updateCurrent(body: PetCurrentPutBody) {
  const res = await fetch("/api/pet-state/current", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { row?: PetRow; error?: string };
  if (!res.ok || !json.row) throw new Error(json.error ?? "Failed to update pet_state.");
  return json.row;
}

function moodToEmoji(mood: Mood) {
  if (mood === "happy") return "ʕ•ᴥ•ʔ";
  if (mood === "sad") return "ʕTᴥTʔ";
  return "ʕºᴥºʔ";
}

function moodToBadge(mood: Mood) {
  if (mood === "happy") return { label: "happy", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
  if (mood === "sad") return { label: "sad", className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" };
  return { label: "hungry", className: "bg-amber-500/10 text-amber-800 dark:text-amber-200" };
}

function StatBar(props: { label: string; value: number; colorClass: string }) {
  const pct = Math.max(0, Math.min(100, props.value)) / 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium" style={{ color: "var(--muted-foreground)" }}>
          {props.label}
        </span>
        <span className="font-mono" style={{ color: "var(--muted-foreground)" }}>
          {Math.round(props.value)}/100
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        <motion.div
          className={`absolute left-0 top-0 h-full w-full ${props.colorClass}`}
          style={{ transformOrigin: "left center" }}
          initial={false}
          animate={{ scaleX: pct }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
        />
      </div>
    </div>
  );
}

export function PetStateRealtime() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [row, setRow] = useState<PetRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    const stored = window.localStorage.getItem("pet_user_name");
    setUserName(stored ?? "");
  }, []);

  useEffect(() => {
    if (!userName) return;
    window.localStorage.setItem("pet_user_name", userName);
  }, [userName]);

  useEffect(() => {
    let cancelled = false;
    fetchCurrent()
      .then((r) => {
        if (!cancelled) setRow(r);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll periodically so the server can "tick" happiness/food/energy based on `last_updated`,
  // even if the user doesn't click any buttons.
  useEffect(() => {
    if (!row?.id) return;
    let cancelled = false;
    const interval = setInterval(() => {
      fetchCurrent()
        .then((next) => {
          if (!cancelled) setRow(next);
        })
        .catch(() => {
          // Ignore transient fetch errors during polling.
        });
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [row?.id]);

  useEffect(() => {
    if (!supabase) return;
    if (!row?.id) return;

    const channel = supabase
      .channel(`pet_state:${row.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pet_state",
          filter: `id=eq.${row.id}`,
        },
        (payload) => {
          const next = payload.new as PetRow | null;
          if (next?.id) setRow(next);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, row?.id]);

  if (!supabase) {
    return (
      <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-medium">Supabase client not configured</div>
        <div className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Set <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> in <span className="font-mono">.env.local</span>.
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-medium">Failed to load pet state</div>
        <div className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          {err}
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Loading…
        </div>
      </div>
    );
  }

  const badge = moodToBadge(row.mood);
  const lastActionBy = row.last_action_by?.trim();
  const lastActionType = row.last_action_type;
  const lastMessage =
    lastActionBy && lastActionType === "feed"
      ? `${lastActionBy} fed the pet ❤️`
      : lastActionBy && lastActionType === "play"
        ? `${lastActionBy} played with the pet 🎾`
        : lastActionBy && lastActionType === "rest"
          ? `${lastActionBy} helped the pet rest 😴`
          : null;

  return (
    <div
      className="rounded-3xl border p-6 shadow-sm"
      style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--card-foreground)" }}
    >
        <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Bublick</div>
        </div>
          <motion.div
            key={row.mood}
            className={`text-xs px-2.5 py-1 rounded-full ${badge.className}`}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            <span className="font-medium">{badge.label}</span>
          </motion.div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-[1.2fr,1fr]">
        <div className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
          <div className="mt-4 flex items-center justify-center">
            <div className="select-none text-5xl tracking-tight" aria-label="pet" title={`mood: ${row.mood}`}>
              <AnimatePresence mode="wait">
                <motion.span
                  key={row.mood}
                  initial={{ opacity: 0, y: 10, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: row.mood === "happy" ? 1.06 : 0.99 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                >
                  {moodToEmoji(row.mood)}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <StatBar label="happiness" value={row.happiness} colorClass="bg-rose-500/90" />
            <StatBar label="food" value={row.food} colorClass="bg-emerald-500/90" />
            <StatBar label="energy" value={row.energy} colorClass="bg-indigo-500/90" />
          </div>

          <div className="mt-4 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
            last updated{" "}
            <span className="font-mono">{new Date(row.last_updated).toLocaleTimeString()}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
              Your name (shown in the last-action message)
            </div>
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g. Anna"
              className="w-full rounded-2xl border px-4 py-3 text-sm font-medium outline-none"
              style={{ borderColor: "var(--border)" }}
            />
          </div>

          <motion.button
            disabled={busy}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98, y: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            onClick={async () => {
              setBusy(true);
              try {
                  const next = await updateCurrent({ action: "feed", userName });
                  setRow(next);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Update failed.");
              } finally {
                setBusy(false);
              }
            }}
            className="w-full rounded-2xl border px-4 py-3 text-sm font-medium transition hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60"
            style={{ borderColor: "var(--border)" }}
          >
            Feed
          </motion.button>

          <motion.button
            disabled={busy}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98, y: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            onClick={async () => {
              setBusy(true);
              try {
                  const next = await updateCurrent({ action: "play", userName });
                  setRow(next);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Update failed.");
              } finally {
                setBusy(false);
              }
            }}
            className="w-full rounded-2xl border px-4 py-3 text-sm font-medium transition hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60"
            style={{ borderColor: "var(--border)" }}
          >
            Play
          </motion.button>

          <motion.button
            disabled={busy}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98, y: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            onClick={async () => {
              setBusy(true);
              try {
                const next = await updateCurrent({ action: "rest", userName });
                setRow(next);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Update failed.");
              } finally {
                setBusy(false);
              }
            }}
            className="w-full rounded-2xl border px-4 py-3 text-sm font-medium transition hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60"
            style={{ borderColor: "var(--border)" }}
          >
            Rest
          </motion.button>

          <div className="pt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Feed increases food (and a little happiness).
          </div>
          <div className="pt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Play raises happiness but depletes food and energy.
          </div>
          <div className="pt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
            Rest replenishes energy.
          </div>
          <br/>

          <div className="text-sm font-medium" style={{ minHeight: 22 }}>
            <AnimatePresence mode="wait">
              <motion.span
                key={lastMessage ?? "none"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {lastMessage ?? "No actions yet."}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

