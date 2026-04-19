export interface AccountContact {
  id: string;
  accountId: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  preferredChannel: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type AccountContactInput = Omit<AccountContact, "id" | "createdAt" | "updatedAt">;
