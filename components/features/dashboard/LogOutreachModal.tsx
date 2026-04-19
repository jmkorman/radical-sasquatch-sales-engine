"use client";

import { useState } from "react";
import { AnyAccount } from "@/types/accounts";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { STATUS_VALUES } from "@/lib/utils/constants";
import { formatActivityNote } from "@/lib/activity/notes";

interface LogOutreachModalProps {
  account: AnyAccount;
  onClose: () => void;
  onSubmit: (data: {
    actionType: string;
    statusAfter: string;
    note: string;
    followUpDate: string;
  }) => Promise<void>;
}

export function LogOutreachModal({
  account,
  onClose,
  onSubmit,
}: LogOutreachModalProps) {
  const [actionType, setActionType] = useState("call");
  const [statusAfter, setStatusAfter] = useState<string>(account.status || "Contacted");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [nextMove, setNextMove] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const note = formatActivityNote({
      summary,
      details,
      nextStep: nextMove,
    });

    if (!note) return;

    setSubmitting(true);
    try {
      await onSubmit({ actionType, statusAfter, note, followUpDate });
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Log Outreach - ${account.account}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm text-gray-300 mb-2">Action Type</label>
          <div className="flex gap-2">
            {["call", "email", "in-person"].map((type) => (
              <button
                key={type}
                onClick={() => setActionType(type)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                  actionType === type
                    ? "bg-rs-gold text-rs-bg font-medium"
                    : "bg-rs-bg border border-rs-border text-gray-300 hover:border-rs-gold"
                }`}
              >
                {type === "in-person" ? "In-Person" : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <Select
          label="Update Status"
          value={statusAfter}
          onChange={(e) => setStatusAfter(e.target.value)}
          options={STATUS_VALUES.filter((s) => s !== "").map((s) => ({
            value: s,
            label: s,
          }))}
        />

        <Input
          label="Outcome Summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Reached GM, left voicemail, sent menu, booked sample drop"
        />

        <Textarea
          label="Details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Capture what happened, objections, timing, and anything you want to remember."
          rows={4}
        />

        <Input
          label="Next Move"
          value={nextMove}
          onChange={(e) => setNextMove(e.target.value)}
          placeholder="Follow up Thursday after 2pm, send pricing sheet, drop samples"
        />

        <Input
          label="Follow-up Date (optional)"
          type="date"
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
        />

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !summary.trim() && !details.trim()}>
            {submitting ? "Saving..." : "Log Outreach"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
