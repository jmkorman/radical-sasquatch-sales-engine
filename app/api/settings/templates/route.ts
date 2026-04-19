import { NextRequest, NextResponse } from "next/server";
import { getAppSetting, upsertAppSetting } from "@/lib/supabase/queries";
import { DEFAULT_TEMPLATES, EmailTemplate } from "@/lib/templates/emailTemplates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TEMPLATES_KEY = "email_templates";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function normalizeTemplate(template: Partial<EmailTemplate>, fallback: EmailTemplate): EmailTemplate {
  return {
    key: template.key ?? fallback.key,
    label: template.label ?? fallback.label,
    subject: template.subject ?? fallback.subject,
    body: template.body ?? fallback.body,
  };
}

function normalizeTemplates(value: unknown): EmailTemplate[] {
  if (!Array.isArray(value)) return DEFAULT_TEMPLATES;

  return DEFAULT_TEMPLATES.map((fallback) => {
    const match = value.find((item) => item && typeof item === "object" && (item as EmailTemplate).key === fallback.key);
    return normalizeTemplate((match as Partial<EmailTemplate> | undefined) ?? {}, fallback);
  });
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return json(DEFAULT_TEMPLATES);
  }

  try {
    const stored = await getAppSetting(TEMPLATES_KEY);
    if (!stored) {
      return json(DEFAULT_TEMPLATES);
    }

    return json(normalizeTemplates(JSON.parse(stored)));
  } catch (error) {
    console.error("Template settings GET error:", error);
    return json(DEFAULT_TEMPLATES);
  }
}

export async function PUT(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return json({ error: "Supabase not configured" }, 503);
  }

  try {
    const body = await request.json();
    const templates = normalizeTemplates(body.templates);
    await upsertAppSetting(TEMPLATES_KEY, JSON.stringify(templates));
    return json(templates);
  } catch (error) {
    console.error("Template settings PUT error:", error);
    return json({ error: "Failed to save email templates" }, 500);
  }
}
