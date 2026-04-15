"use client";

import { useEffect, useState } from "react";
import { ProspectTable } from "@/components/features/prospecting/ProspectTable";
import { Prospect } from "@/types/prospects";
import { Spinner } from "@/components/ui/Spinner";

export default function ProspectingPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProspects = async () => {
    try {
      const res = await fetch("/api/prospects");
      if (res.ok) setProspects(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadProspects();
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-white">Prospecting</h2>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <ProspectTable prospects={prospects} onRefresh={loadProspects} />
      )}
    </div>
  );
}
