import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Mood = "happy" | "sad" | "hungry";

export async function GET() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("pet_state")
    .select("id,mood,hunger_level,last_updated")
    .order("last_updated", { ascending: false })
    .limit(25);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { mood?: Mood; hunger_level?: number }
    | null;

  const mood = body?.mood;
  const hunger_level = body?.hunger_level;

  if (!mood) return NextResponse.json({ error: "Missing mood." }, { status: 400 });
  if (typeof hunger_level !== "number")
    return NextResponse.json({ error: "Missing hunger_level." }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("pet_state")
    .insert({ mood, hunger_level })
    .select("id,mood,hunger_level,last_updated")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data }, { status: 201 });
}

