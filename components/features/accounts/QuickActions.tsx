"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { copyToClipboard } from "@/lib/utils/phone";

interface QuickActionsProps {
  phone: string;
  email: string;
}

export function QuickActions({ phone, email }: QuickActionsProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (text: string, label: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {phone && (
        <>
          <a href={`tel:${phone}`}>
            <Button variant="secondary" size="sm">Call</Button>
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(phone, "phone")}
          >
            {copied === "phone" ? "Copied!" : "Copy Phone"}
          </Button>
        </>
      )}
      {email && (
        <>
          <a href={`mailto:${email}`}>
            <Button variant="secondary" size="sm">Email</Button>
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(email, "email")}
          >
            {copied === "email" ? "Copied!" : "Copy Email"}
          </Button>
        </>
      )}
    </div>
  );
}
