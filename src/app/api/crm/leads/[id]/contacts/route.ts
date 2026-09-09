import { NextResponse } from "next/server";

import {
  addCrmContact,
  crmBackend,
  deleteCrmContact,
  patchCrmContact,
} from "@/lib/crm/repo";
import type { CrmContactInput } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as CrmContactInput;
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const contact = await addCrmContact(id, body);
    if (!contact) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ contact, backend: crmBackend() });
  } catch (e) {
    console.error("crm contacts POST", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add contact" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as CrmContactInput & { contactId?: string };
    if (!body?.contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }
    const { contactId, ...rest } = body;
    const contact = await patchCrmContact(id, contactId, rest);
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ contact, backend: crmBackend() });
  } catch (e) {
    console.error("crm contacts PATCH", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update contact" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const contactId = url.searchParams.get("contactId");
    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }
    const ok = await deleteCrmContact(id, contactId);
    if (!ok) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, backend: crmBackend() });
  } catch (e) {
    console.error("crm contacts DELETE", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete contact" },
      { status: 500 }
    );
  }
}
