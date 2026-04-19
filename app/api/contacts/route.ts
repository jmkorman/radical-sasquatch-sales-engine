import { NextRequest, NextResponse } from "next/server";
import {
  createAccountContact,
  deleteAccountContact,
  getAccountContacts,
  updateAccountContact,
} from "@/lib/contacts/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function GET(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return json([]);
  }

  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return json({ error: "accountId is required" }, 400);
  }

  try {
    const contacts = await getAccountContacts(accountId);
    return json(contacts);
  } catch (error) {
    console.error("Contacts GET error:", error);
    return json([]);
  }
}

export async function POST(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return json({ error: "Supabase not configured" }, 503);
  }

  try {
    const body = await request.json();
    if (!body.accountId) {
      return json({ error: "accountId is required" }, 400);
    }

    const contact = await createAccountContact(body.accountId, {
      name: body.name ?? "",
      role: body.role ?? "",
      email: body.email ?? "",
      phone: body.phone ?? "",
      preferredChannel: body.preferredChannel ?? "",
      notes: body.notes ?? "",
    });

    return json(contact, 201);
  } catch (error) {
    console.error("Contacts POST error:", error);
    return json({ error: "Failed to create contact" }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return json({ error: "Supabase not configured" }, 503);
  }

  try {
    const body = await request.json();
    if (!body.accountId || !body.id) {
      return json({ error: "accountId and id are required" }, 400);
    }

    const contact = await updateAccountContact(body.accountId, body.id, {
      name: body.name,
      role: body.role,
      email: body.email,
      phone: body.phone,
      preferredChannel: body.preferredChannel,
      notes: body.notes,
    });

    if (!contact) {
      return json({ error: "Contact not found" }, 404);
    }

    return json(contact);
  } catch (error) {
    console.error("Contacts PATCH error:", error);
    return json({ error: "Failed to update contact" }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return json({ error: "Supabase not configured" }, 503);
  }

  const accountId = request.nextUrl.searchParams.get("accountId");
  const id = request.nextUrl.searchParams.get("id");
  if (!accountId || !id) {
    return json({ error: "accountId and id are required" }, 400);
  }

  try {
    const removed = await deleteAccountContact(accountId, id);
    if (!removed) {
      return json({ error: "Contact not found" }, 404);
    }

    return json({ success: true });
  } catch (error) {
    console.error("Contacts DELETE error:", error);
    return json({ error: "Failed to delete contact" }, 500);
  }
}
