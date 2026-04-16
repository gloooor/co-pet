import { PetStateRealtime } from "./PetStateRealtime";

export default function PetPage() {
  return (
    <div className="flex-1 bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <div className="container py-10">
        <div className="mb-6">
          <div className="text-2xl font-semibold tracking-tight">Your common pet ^^</div>
        </div>
        <PetStateRealtime />
      </div>
    </div>
  );
}

