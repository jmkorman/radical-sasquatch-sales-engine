"use client";

import { TemplateEditor } from "@/components/features/settings/TemplateEditor";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useSheetStore } from "@/stores/useSheetStore";

export default function SettingsPage() {
  const { fetchAllTabs, syncStatus } = useSheetStore();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Settings</h2>

      <Card>
        <h3 className="text-lg font-semibold text-white mb-3">Data Sync</h3>
        <p className="text-sm text-gray-400 mb-3">
          Manually refresh all data from the Google Sheet.
        </p>
        <Button
          onClick={fetchAllTabs}
          disabled={syncStatus === "syncing"}
        >
          {syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
        </Button>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold text-white mb-3">Notion Integration</h3>
        <p className="text-sm text-gray-400 mb-3">
          Follow-up tasks are automatically created in your Notion database when you set a follow-up date.
          Set NOTION_API_KEY and NOTION_DATABASE_ID in your environment variables.
        </p>
        <Button variant="secondary" disabled>
          Notion Sync (automatic via cron)
        </Button>
      </Card>

      <TemplateEditor />

      <Card>
        <h3 className="text-lg font-semibold text-white mb-3">Environment</h3>
        <div className="text-sm space-y-1">
          <div className="text-gray-400">
            Google Sheet: <span className="text-gray-300">{process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID ? "Connected" : "Set GOOGLE_SHEET_ID"}</span>
          </div>
          <div className="text-gray-400">
            Supabase: <span className="text-gray-300">{process.env.NEXT_PUBLIC_SUPABASE_URL ? "Connected" : "Set SUPABASE_URL"}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
