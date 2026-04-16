import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Mood = "happy" | "sad" | "hungry";
type PetAction = "feed" | "play" | "rest";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// Game loop rules (per minute).
// Tuned so the state changes are visible quickly in development.
const HAPPINESS_DECAY_PER_MIN = 1;
const FOOD_DECAY_PER_MIN = 1;
const ENERGY_DECAY_PER_MIN = 2;

// Action effects.
const FEED_FOOD_GAIN = 25;
const FEED_HAPPINESS_GAIN = 2;

const PLAY_HAPPINESS_GAIN = 15;
const PLAY_FOOD_COST = 10;
const PLAY_ENERGY_COST = 12;

const REST_ENERGY_GAIN = 30;
const REST_HAPPINESS_GAIN = 4;

function moodFromStats(input: { happiness: number; food: number; energy: number }): Mood {
  if (input.food <= 20) return "hungry";
  if (input.energy <= 20) return "sad";
  if (input.happiness <= 35) return "sad";
  return "happy";
}

function hungerLevelFromSatiety(food: number) {
  return clamp(100 - food, 0, 100);
}

function foodFromHunger(hunger_level: number) {
  return clamp(100 - hunger_level, 0, 100);
}

async function getOrCreateCurrent() {
  const supabase = supabaseAdmin();
  const { data: existing, error: selectErr } = await supabase
    .from("pet_state")
    .select("id,mood,hunger_level,last_updated,last_fed_at,last_action_by,last_action_type,happiness,food,energy")
    .order("last_updated", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectErr) throw new Error(selectErr.message);
  if (existing) return existing;

  const { data: created, error: insertErr } = await supabase
    .from("pet_state")
    .insert({
      happiness: 60,
      food: 60,
      energy: 60,
      hunger_level: hungerLevelFromSatiety(60),
      mood: moodFromStats({ happiness: 60, food: 60, energy: 60 }) as Mood,
    })
    .select("id,mood,hunger_level,last_updated,last_fed_at,last_action_by,last_action_type,happiness,food,energy")
    .single();

  if (insertErr) throw new Error(insertErr.message);
  return created;
}

function computeStatsTick(input: { happiness: number; food: number; energy: number; mood?: Mood; last_updated?: string | null }, nowMs: number) {
  const lastUpdatedMs = input.last_updated ? new Date(input.last_updated).getTime() : NaN;
  if (!Number.isFinite(lastUpdatedMs)) {
    const mood = moodFromStats({ happiness: input.happiness, food: input.food, energy: input.energy });
    return {
      happiness: input.happiness,
      food: input.food,
      energy: input.energy,
      mood,
      changed: input.mood ? mood !== input.mood : true,
    };
  }

  const elapsedMinutes = Math.max(0, Math.floor((nowMs - lastUpdatedMs) / 60_000));
  if (elapsedMinutes <= 0) {
    const mood = moodFromStats({ happiness: input.happiness, food: input.food, energy: input.energy });
    return {
      happiness: input.happiness,
      food: input.food,
      energy: input.energy,
      mood,
      changed: input.mood ? mood !== input.mood : false,
    };
  }

  const happiness = clamp(input.happiness - elapsedMinutes * HAPPINESS_DECAY_PER_MIN, 0, 100);
  const food = clamp(input.food - elapsedMinutes * FOOD_DECAY_PER_MIN, 0, 100);
  const energy = clamp(input.energy - elapsedMinutes * ENERGY_DECAY_PER_MIN, 0, 100);
  const mood = moodFromStats({ happiness, food, energy });

  return {
    happiness,
    food,
    energy,
    mood,
    changed:
      happiness !== input.happiness ||
      food !== input.food ||
      energy !== input.energy ||
      (input.mood ? mood !== input.mood : true),
  };
}

async function updateCurrentById(
  currentId: string,
  patch: Partial<{
    mood: Mood;
    hunger_level: number;
    happiness: number;
    food: number;
    energy: number;
    last_action_by: string | null;
    last_action_type: string | null;
  }>,
) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("pet_state")
    .update(patch)
    .eq("id", currentId)
    .select("id,mood,hunger_level,last_updated,last_fed_at,last_action_by,last_action_type,happiness,food,energy")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function GET() {
  try {
    const supabase = supabaseAdmin();
    const row = await getOrCreateCurrent();

    const nowMs = Date.now();
    const tick = computeStatsTick(
      {
        happiness: typeof row.happiness === "number" ? row.happiness : 60,
        food: typeof row.food === "number" ? row.food : foodFromHunger(row.hunger_level),
        energy: typeof row.energy === "number" ? row.energy : 60,
        mood: row.mood,
        last_updated: row.last_updated,
      },
      nowMs,
    );
    if (!tick.changed) {
      return NextResponse.json({
        row: {
          ...row,
          hunger_level: hungerLevelFromSatiety(tick.food),
          happiness: tick.happiness,
          food: tick.food,
          energy: tick.energy,
          mood: tick.mood,
        },
      });
    }

    // Persist so Supabase realtime can notify clients.
    const { data, error } = await supabase
      .from("pet_state")
      .update({
        hunger_level: hungerLevelFromSatiety(tick.food),
        happiness: tick.happiness,
        food: tick.food,
        energy: tick.energy,
        mood: tick.mood,
      })
      .eq("id", row.id)
      .select("id,mood,hunger_level,last_updated,last_fed_at,last_action_by,last_action_type,happiness,food,energy")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ row: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { action?: PetAction; mood?: Mood; hunger_level?: number; userName?: string }
    | null;

  const action = body?.action;
  const actorName = body?.userName?.trim() || "Someone";

  const mood = body?.mood;
  const hunger_level = body?.hunger_level;

  const isLegacyPatch = !action && (!mood && typeof hunger_level !== "number");
  if (isLegacyPatch) {
    return NextResponse.json({ error: "Provide action or mood/hunger_level." }, { status: 400 });
  }

  try {
    const current = await getOrCreateCurrent();
    const nowMs = Date.now();

    // Apply time-based stat tick first, so actions work from the latest state.
    const tick = computeStatsTick(
      {
        happiness: typeof current.happiness === "number" ? current.happiness : 60,
        food: typeof current.food === "number" ? current.food : foodFromHunger(current.hunger_level),
        energy: typeof current.energy === "number" ? current.energy : 60,
        mood: current.mood,
        last_updated: current.last_updated,
      },
      nowMs,
    );

    const effectiveHappiness = tick.happiness;
    const effectiveSatiety = tick.food;
    const effectiveEnergy = tick.energy;

    if (action === "feed") {
      const newSatiety = clamp(effectiveSatiety + FEED_FOOD_GAIN, 0, 100);
      const newHappiness = clamp(effectiveHappiness + FEED_HAPPINESS_GAIN, 0, 100);
      const newEnergy = effectiveEnergy;
      const newMood = moodFromStats({ happiness: newHappiness, food: newSatiety, energy: newEnergy });
      const supabase = supabaseAdmin();
      const { data, error } = await supabase
        .from("pet_state")
        .update({
          hunger_level: hungerLevelFromSatiety(newSatiety),
          happiness: newHappiness,
          food: newSatiety,
          energy: newEnergy,
          mood: newMood,
          last_fed_at: new Date(nowMs).toISOString(),
          last_action_by: actorName,
          last_action_type: "feed",
        })
        .eq("id", current.id)
        .select("id,mood,hunger_level,last_updated,last_fed_at,last_action_by,last_action_type,happiness,food,energy")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ row: data }, { status: 200 });
    }

    if (action === "play") {
      const newHappiness = clamp(effectiveHappiness + PLAY_HAPPINESS_GAIN, 0, 100);
      const newSatiety = clamp(effectiveSatiety - PLAY_FOOD_COST, 0, 100);
      const newEnergy = clamp(effectiveEnergy - PLAY_ENERGY_COST, 0, 100);
      const newMood = moodFromStats({ happiness: newHappiness, food: newSatiety, energy: newEnergy });

      const row = await updateCurrentById(current.id, {
        mood: newMood,
        hunger_level: hungerLevelFromSatiety(newSatiety),
        happiness: newHappiness,
        food: newSatiety,
        energy: newEnergy,
        last_action_by: actorName,
        last_action_type: "play",
      });
      return NextResponse.json({ row }, { status: 200 });
    }

    if (action === "rest") {
      const newHappiness = clamp(effectiveHappiness + REST_HAPPINESS_GAIN, 0, 100);
      const newEnergy = clamp(effectiveEnergy + REST_ENERGY_GAIN, 0, 100);
      const newSatiety = effectiveSatiety;
      const newMood = moodFromStats({ happiness: newHappiness, food: newSatiety, energy: newEnergy });

      const row = await updateCurrentById(current.id, {
        mood: newMood,
        hunger_level: hungerLevelFromSatiety(newSatiety),
        happiness: newHappiness,
        food: newSatiety,
        energy: newEnergy,
        last_action_by: actorName,
        last_action_type: "rest",
      });
      return NextResponse.json({ row }, { status: 200 });
    }

    // Legacy behavior: allow direct mood/hunger updates if client still sends them.
    const patch: { mood?: Mood; hunger_level?: number } = {};
    if (mood) patch.mood = mood;
    if (typeof hunger_level === "number") patch.hunger_level = hunger_level;

    // Legacy behavior doesn't set last_action fields.
    const row = await updateCurrentById(current.id, patch);
    return NextResponse.json({ row }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

