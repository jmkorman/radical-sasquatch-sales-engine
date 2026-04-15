"use client";

import { useState } from "react";
import { Prospect } from "@/types/prospects";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { SearchBar } from "@/components/ui/SearchBar";

interface ProspectTableProps {
  prospects: Prospect[];
  onRefresh: () => void;
}

export function ProspectTable({ prospects, onRefresh }: ProspectTableProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    business_name: "",
    type: "",
    address: "",
    website: "",
    instagram: "",
    notes: "",
    source: "manual",
  });

  const filtered = prospects.filter((p) =>
    p.business_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async () => {
    await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowAdd(false);
    setForm({ business_name: "", type: "", address: "", website: "", instagram: "", notes: "", source: "manual" });
    onRefresh();
  };

  const handleAddToSheet = async (prospect: Prospect) => {
    await fetch("/api/prospects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: prospect.id, tab: "Restaurants" }),
    });
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <SearchBar value={search} onChange={setSearch} placeholder="Search prospects..." />
        <Button onClick={() => setShowAdd(true)}>Add Prospect</Button>
      </div>

      {/* Placeholder for future API search */}
      <Card className="border-dashed border-rs-gold/30">
        <div className="text-center py-4">
          <div className="text-sm text-gray-400">Denver Bars and Breweries Search</div>
          <div className="text-xs text-gray-500 mt-1">Google Maps / Yelp API integration coming soon</div>
          <Input
            placeholder="Search Denver bars and breweries..."
            className="mt-3 max-w-md mx-auto"
            disabled
          />
        </div>
      </Card>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rs-border text-left text-gray-400">
              <th className="pb-2 pr-4 font-medium">Business</th>
              <th className="pb-2 pr-4 font-medium hidden sm:table-cell">Type</th>
              <th className="pb-2 pr-4 font-medium hidden md:table-cell">Address</th>
              <th className="pb-2 pr-4 font-medium hidden lg:table-cell">Source</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-rs-border/50">
                <td className="py-3 pr-4">
                  <div className="text-white font-medium">{p.business_name}</div>
                  {p.notes && <div className="text-xs text-gray-500 mt-0.5">{p.notes}</div>}
                </td>
                <td className="py-3 pr-4 text-gray-400 hidden sm:table-cell">{p.type}</td>
                <td className="py-3 pr-4 text-gray-400 hidden md:table-cell">{p.address}</td>
                <td className="py-3 pr-4 text-gray-500 hidden lg:table-cell">{p.source}</td>
                <td className="py-3">
                  {!p.added_to_sheet && (
                    <Button size="sm" variant="secondary" onClick={() => handleAddToSheet(p)}>
                      Add to Pipeline
                    </Button>
                  )}
                  {p.added_to_sheet && (
                    <span className="text-xs text-status-won">Added</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">
                  No prospects yet. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="Add Prospect" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <Input label="Business Name" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required />
            <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={[{ value: "", label: "Select type" }, { value: "Bar", label: "Bar" }, { value: "Brewery", label: "Brewery" }, { value: "Restaurant", label: "Restaurant" }, { value: "Retail", label: "Retail" }, { value: "Catering", label: "Catering" }, { value: "Food Truck", label: "Food Truck" }]} />
            <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <Input label="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            <Input label="Instagram" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
            <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={!form.business_name}>Add</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
