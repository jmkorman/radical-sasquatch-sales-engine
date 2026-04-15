"use client";

import { useTemplateStore } from "@/stores/useTemplateStore";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function TemplateEditor() {
  const { templates, updateTemplate, loadDefaults } = useTemplateStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Email Templates</h3>
        <Button variant="ghost" size="sm" onClick={loadDefaults}>
          Reset to Defaults
        </Button>
      </div>

      {templates.map((template) => (
        <Card key={template.key}>
          <div className="space-y-3">
            <div className="text-sm font-medium text-rs-gold">{template.label}</div>
            <Input
              label="Subject"
              value={template.subject}
              onChange={(e) =>
                updateTemplate(template.key, { subject: e.target.value })
              }
            />
            <Textarea
              label="Body"
              value={template.body}
              onChange={(e) =>
                updateTemplate(template.key, { body: e.target.value })
              }
              rows={6}
            />
            <div className="text-xs text-gray-500">
              Available placeholders: {"{{contactName}}"}, {"{{accountName}}"}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
