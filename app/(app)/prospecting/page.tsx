"use client";

import { useEffect, useState } from "react";
import { ProspectTable } from "@/components/features/prospecting/ProspectTable";
import { Prospect, ProspectFinderBucket } from "@/types/prospects";
import { Spinner } from "@/components/ui/Spinner";

export default function ProspectingPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [buckets, setBuckets] = useState<ProspectFinderBucket[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadProspects() {
    setLoading(true);
    try {
      const response = await fetch("/api/prospects", { cache: "no-store" });
      const data = await response.json();
      setProspects(Array.isArray(data) ? data : data.prospects ?? []);
      setBuckets(Array.isArray(data) ? [] : data.buckets ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProspects();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black uppercase tracking-[0.1em] text-rs-gold sm:text-3xl">
          Prospecting
        </h2>
        <div className="mt-1 text-sm text-[#af9fe6]">
          Recurring account finding, enrichment, and trigger signals before leads enter the Pipeline.
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <ProspectTable prospects={prospects} buckets={buckets} onRefresh={loadProspects} />
      )}
    </div>
  );
}
